// GET /api/cron/daily-report — 일간 학습 보고서 알림톡 (매일 22:00 KST)
//
// 대상: 그날 goal_daily_records 에 기록을 남긴 학생의 **연결된 학부모**.
//   기록이 없는 날은 보내지 않는다(사용자 확정 2026-08-22) — 「실제 학습 시간
//   0분, 달성률 0%」가 매일 가면 잔소리로 느껴져 수신거부를 부르고, 발송량도
//   불필요하게 늘어난다.
//
// 시각: 22:00 KST = 13:00 UTC (vercel.json crons "0 13 * * *").
//   학생이 저녁에 기록을 쓰므로 이 시각이면 그날 데이터가 차 있다.
//
// 실패는 건별로 삼킨다 — 한 명이 실패했다고 나머지가 멈추면 안 된다.
// 집계 결과를 응답으로 돌려주고, 상세는 alimtalk_send_logs 에 남는다.
//
// 조회(오늘 기록이 있는 학생·계획·수신자)와 발송(sendAndLog)은
// api/_lib/goalReportSend.ts 의 loadDailyReportInputs/sendDailyReport 로
// 옮겼다 — 관리자 재발송(api/goal/admin/resend-report.ts)이 같은 함수를
// 재사용한다. 조회는 학생 수와 무관하게 고정 횟수(배치)로 돈다 — 학생마다
// 다시 조회하지 않는다.

import { kstNow, toYmd } from "../_lib/goalReportNotify.js";
import {
  loadDailyReportInputs,
  sendDailyReport,
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
  unhandledMessage: "일간 학습 보고서 발송 중 오류가 발생했습니다.",
  logLabel: "cron/daily-report",
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;

    // 쿼리로 날짜를 강제할 수 있게 둔다 — 발송이 하루 밀렸을 때 손으로 메우거나
    // 로컬에서 특정 날짜를 재현할 때 필요하다(크론 인증은 그대로 요구한다).
    const today = String(req.query.date || toYmd(kstNow()));

    // studentIds=null → 오늘 기록이 있는 학생을 loadDailyReportInputs가 직접
    // 찾는다(기록·계획·수신자 조회가 학생 수와 무관하게 고정 횟수로 돈다).
    const inputs = await loadDailyReportInputs(supabaseAdmin, null, today);

    if (inputs.size === 0) {
      res.status(200).json({ ok: true, date: today, records: 0 });
      return;
    }

    const summary = { sent: 0, failed: 0, skipped: 0, noParent: 0 };

    for (const [studentId, input] of inputs) {
      const result = await sendDailyReport(supabaseAdmin, input);

      if (result.noParent) {
        summary.noParent += 1;
        continue;
      }

      for (const outcome of result.outcomes) {
        if (outcome.status === "sent") summary.sent += 1;
        else if (outcome.status === "failed") {
          summary.failed += 1;
          console.error(
            `cron/daily-report 발송 실패 student=${studentId}: ${outcome.reason}`,
          );
        } else summary.skipped += 1;
      }
    }

    console.log(
      `cron/daily-report ${today} — 기록 ${inputs.size}건, ${JSON.stringify(summary)}`,
    );

    res
      .status(200)
      .json({ ok: true, date: today, records: inputs.size, ...summary });
  },
});
