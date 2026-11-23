// GET /api/cron/monthly-report — 월간 학습 리포트 발행 안내 (학생 현지 1일 08:00)
//
// 시각: 매시 정각에 돌고(vercel.json crons "0 * * * *"), 현지 시각이 1일
//   08시인 학생(profiles.time_zone)에게만 보낸다. cron 표현식에는 "그 달의
//   마지막 날"이 없고 시간대마다 1일 08시의 UTC 시각이 달라서, 매시 깨워
//   학생별 현지 시각으로 판정한다. 서울 학생은 말일 23:00 UTC 실행이다.
//   같은 시간 안의 재실행은 dedupeKey(monthlyReport:학부모:학생:YYYY-MM)가
//   같아 발송기(sendAndLog)가 한 번만 보낸다.
//
// 대상: **지난 달**에 기록이 하나라도 있는 학생의 연결된 학부모.
// 링크의 reportId: 월간 키 = 'YYYY-MM' (api/goal/report).
//
// 조회(지난 달 기록이 있는 학생·수신자)와 발송(sendAndLog)은
// api/_lib/goal/reportSend.ts 의 loadMonthlyReportInputs/sendMonthlyReport 로
// 옮겼다 — 관리자 재발송(api/_routes/goal/admin/resend-report.ts)이 같은 함수를
// 재사용한다. 조회는 학생 수와 무관하게 고정 횟수(배치)로 돈다.

import { findDueStudents } from "../_lib/goal/reportNotify.js";
import {
  loadMonthlyReportInputs,
  type MonthlyReportInput,
  sendMonthlyReport,
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
  unhandledMessage: "월간 학습 리포트 발송 중 오류가 발생했습니다.",
  logLabel: "cron/monthly-report",
  handler: async (req, res, ctx) => {
    const forcedMonth =
      typeof req.query.month === "string" && req.query.month
        ? req.query.month
        : null;

    // split 결과가 undefined 일 수 있다고 보므로(noUncheckedIndexedAccess) 명시적으로
    // 좁힌다. 강제한 month 형식이 깨지면 여기서 400 으로 끊는 편이 낫다 —
    // NaN 이 그대로 흘러가면 조회 범위가 조용히 어긋난 채 발송된다.
    if (forcedMonth) {
      const [yearPart, monthPart] = forcedMonth.split("-");
      const year = Number(yearPart);
      const month = Number(monthPart);
      if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12
      ) {
        res
          .status(400)
          .json({ detail: `month 형식이 올바르지 않습니다: ${forcedMonth}` });
        return;
      }
    }

    const supabaseAdmin = ctx.supabaseAdmin;

    // 손으로 메우는 경우(?month=2026-07)는 시각·시간대와 무관하게 그 달에 기록이
    // 있는 학생 전원이 대상이다.
    const inputs: MonthlyReportInput[] = [];
    const months: string[] = [];
    if (forcedMonth) {
      months.push(forcedMonth);
      inputs.push(
        ...(
          await loadMonthlyReportInputs(supabaseAdmin, null, forcedMonth)
        ).values(),
      );
    } else {
      // 지금이 현지 1일 08시인 학생을 "지난 달"(YYYY-MM)별로 묶는다.
      const due = await findDueStudents(supabaseAdmin, "monthly", new Date());
      for (const [month, ids] of due) {
        months.push(month);
        inputs.push(
          ...(
            await loadMonthlyReportInputs(supabaseAdmin, ids, month, {
              requireRecords: true,
            })
          ).values(),
        );
      }
    }

    if (inputs.length === 0) {
      res.status(200).json({ ok: true, months, students: 0 });
      return;
    }

    const summary = { sent: 0, failed: 0, skipped: 0 };

    for (const input of inputs) {
      const studentId = input.studentProfileId;
      const result = await sendMonthlyReport(supabaseAdmin, input);

      for (const outcome of result.outcomes) {
        if (outcome.status === "sent") summary.sent += 1;
        else if (outcome.status === "failed") {
          summary.failed += 1;
          console.error(
            `cron/monthly-report 발송 실패 student=${studentId}: ${outcome.reason}`,
          );
        } else summary.skipped += 1;
      }
    }

    console.log(
      `cron/monthly-report ${months.join(",")} — 학생 ${inputs.length}명, ${JSON.stringify(summary)}`,
    );

    res.status(200).json({
      ok: true,
      months,
      students: inputs.length,
      ...summary,
    });
  },
});
