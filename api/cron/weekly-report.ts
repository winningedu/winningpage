// GET /api/cron/weekly-report — 주간 학습 리포트 발행 안내 (학생 현지 월요일 08:00)
//
// 시각: 매시 정각에 돌고(vercel.json crons "0 * * * *"), 현지 시각이 월요일
//   08시인 학생(profiles.time_zone)에게만 보낸다. 서울 학생은 일 23:00 UTC
//   실행이다. 같은 시간 안의 재실행은 dedupeKey(weeklyReport:학부모:학생:
//   주 월요일)가 같아 발송기(sendAndLog)가 한 번만 보낸다.
//
// 대상: **지난 주**에 기록이 하나라도 있는 학생의 연결된 학부모.
//   기록이 전혀 없는 학생에게 "리포트가 발행되었습니다"를 보내면 열어봤을 때
//   빈 리포트라 안 보내느니만 못하다(일간의 "기록 남긴 날만"과 같은 원칙).
//
// 링크의 reportId
//   리포트는 저장되지 않고 기간 키로 계산된다 — 주간 키는 **그 주 월요일 YMD**다
//   (api/goal/report). 그래서 지난 주 월요일을 그대로 넣는다. 이렇게 해야 2주
//   뒤에 링크를 눌러도 그 주 리포트가 열린다.
//
// 조회(지난 주 기록이 있는 학생·수신자)와 발송(sendAndLog)은
// api/_lib/goal/reportSend.ts 의 loadWeeklyReportInputs/sendWeeklyReport 로
// 옮겼다 — 관리자 재발송(api/_routes/goal/admin/resend-report.ts)이 같은 함수를
// 재사용한다. 조회는 학생 수와 무관하게 고정 횟수(배치)로 돈다.

import { addDaysYmd } from "../../src/lib/time/day.js";
import { findDueStudents } from "../_lib/goal/reportNotify.js";
import {
  loadWeeklyReportInputs,
  sendWeeklyReport,
  type WeeklyReportInput,
} from "../_lib/goal/reportSend.js";
import { defineHandler } from "../_lib/handler.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

export default defineHandler({
  methods: ["GET"],
  auth: "cron",
  errorShape: "detail",
  // dev 원본은 { detail: "Unauthorized" }였다 — 공통 CRON_REQUIRED_MESSAGE
  // ("인증이 필요합니다.")는 performance/cleanup-attachments 등 다른 cron 라우트
  // 기준이라 여기서만 override한다.
  authFailureMessage: "Unauthorized",
  unhandledMessage: "주간 학습 리포트 발송 중 오류가 발생했습니다.",
  logLabel: "cron/weekly-report",
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;

    // 손으로 메울 때를 위해 주 시작일(월요일 YMD)을 강제할 수 있게 둔다.
    // 강제하면 시각·시간대와 무관하게 그 주에 기록이 있는 학생 전원이 대상이다.
    const forcedWeek =
      typeof req.query.week === "string" && req.query.week
        ? req.query.week
        : null;

    const inputs: WeeklyReportInput[] = [];
    const weekStarts: string[] = [];
    if (forcedWeek) {
      weekStarts.push(forcedWeek);
      inputs.push(
        ...(
          await loadWeeklyReportInputs(supabaseAdmin, null, forcedWeek)
        ).values(),
      );
    } else {
      // 지금이 현지 월요일 08시인 학생을 "지난 주 월요일"별로 묶는다.
      const due = await findDueStudents(supabaseAdmin, "weekly", new Date());
      for (const [weekStart, ids] of due) {
        weekStarts.push(weekStart);
        inputs.push(
          ...(
            await loadWeeklyReportInputs(supabaseAdmin, ids, weekStart, {
              requireRecords: true,
            })
          ).values(),
        );
      }
    }

    if (inputs.length === 0) {
      res.status(200).json({ ok: true, weekStarts, students: 0 });
      return;
    }

    const summary = { sent: 0, failed: 0, skipped: 0 };

    for (const input of inputs) {
      const studentId = input.studentProfileId;
      const result = await sendWeeklyReport(supabaseAdmin, input);

      for (const outcome of result.outcomes) {
        if (outcome.status === "sent") summary.sent += 1;
        else if (outcome.status === "failed") {
          summary.failed += 1;
          console.error(
            `cron/weekly-report 발송 실패 student=${studentId}: ${outcome.reason}`,
          );
        } else summary.skipped += 1;
      }
    }

    console.log(
      `cron/weekly-report ${weekStarts.join(",")} — 학생 ${inputs.length}명, ${JSON.stringify(summary)}`,
    );

    res.status(200).json({
      ok: true,
      weekStarts,
      weekEnds: weekStarts.map((weekStart) => addDaysYmd(weekStart, 6)),
      students: inputs.length,
      ...summary,
    });
  },
});
