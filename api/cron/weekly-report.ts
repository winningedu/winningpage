// GET /api/cron/weekly-report — 주간 학습 리포트 발행 안내 (매주 월 08:00 KST)
//
// 시각: 월 08:00 KST = 일 23:00 UTC (vercel.json crons "0 23 * * 0").
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
// api/_lib/goalReportSend.ts 의 loadWeeklyReportInputs/sendWeeklyReport 로
// 옮겼다 — 관리자 재발송(api/goal/admin/resend-report.ts)이 같은 함수를
// 재사용한다. 조회는 학생 수와 무관하게 고정 횟수(배치)로 돈다.

import { kstNow, mondayOf, toYmd } from "../_lib/goalReportNotify.js";
import {
  loadWeeklyReportInputs,
  sendWeeklyReport,
} from "../_lib/goalReportSend.js";
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

    // 이번 주 월요일에서 7일을 빼면 지난 주 월요일. 발송 시점이 월요일 아침이라
    // "지난 주"가 방금 끝난 주다.
    const thisMonday = mondayOf(kstNow());
    const lastMonday = new Date(thisMonday.getTime());
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
    const lastSunday = new Date(thisMonday.getTime());
    lastSunday.setUTCDate(lastSunday.getUTCDate() - 1);

    // 손으로 메울 때를 위해 주 시작일을 강제할 수 있게 둔다.
    const weekStart = String(req.query.week || toYmd(lastMonday));
    const weekEnd =
      req.query.week && typeof req.query.week === "string"
        ? toYmd(
            new Date(
              new Date(`${req.query.week}T00:00:00Z`).getTime() +
                6 * 24 * 60 * 60 * 1000,
            ),
          )
        : toYmd(lastSunday);

    // studentIds=null → 그 주에 기록이 있는 학생을 loadWeeklyReportInputs가
    // 직접 찾는다(수신자 조회가 학생 수와 무관하게 고정 횟수로 돈다).
    const inputs = await loadWeeklyReportInputs(supabaseAdmin, null, weekStart);

    if (inputs.size === 0) {
      res.status(200).json({ ok: true, weekStart, students: 0 });
      return;
    }

    const summary = { sent: 0, failed: 0, skipped: 0 };

    for (const [studentId, input] of inputs) {
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
      `cron/weekly-report ${weekStart}~${weekEnd} — 학생 ${inputs.size}명, ${JSON.stringify(summary)}`,
    );

    res.status(200).json({
      ok: true,
      weekStart,
      weekEnd,
      students: inputs.size,
      ...summary,
    });
  },
});
