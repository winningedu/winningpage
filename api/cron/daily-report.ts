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
// 학생 1명분 발송(기록 조회·변수 조립·dedupeKey·sendAndLog)은
// api/_lib/goalReportSend.ts 의 sendDailyReportFor 로 옮겼다 — 관리자 재발송
// (api/goal/admin/resend-report.ts)이 같은 로직을 재사용한다. 이 파일은 "오늘
// 기록을 남긴 학생이 누구인지" 골라 그 함수를 호출하는 역할만 한다.

import { kstNow, toYmd } from "../_lib/goalReportNotify.js";
import { sendDailyReportFor } from "../_lib/goalReportSend.js";
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

    const { data: records, error } = await supabaseAdmin
      .from("goal_daily_records")
      .select("profile_id")
      .eq("record_date", today);

    if (error) {
      console.error("cron/daily-report 기록 조회 실패:", error);
      res.status(500).json({ detail: error.message });
      return;
    }

    const rows = records || [];
    if (rows.length === 0) {
      res.status(200).json({ ok: true, date: today, records: 0 });
      return;
    }

    // (profile_id, record_date) 는 UNIQUE(§실제 달력 모델) 이므로 학생 수 ===
    // 기록 행 수다 — record별이 아니라 studentId별로 한 번씩만 발송을 시도한다.
    const studentIds = Array.from(
      new Set(rows.map((r) => String(r.profile_id))),
    );

    const summary = { sent: 0, failed: 0, skipped: 0, noParent: 0 };

    for (const studentId of studentIds) {
      const result = await sendDailyReportFor(supabaseAdmin, studentId, today);

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
      `cron/daily-report ${today} — 기록 ${rows.length}건, ${JSON.stringify(summary)}`,
    );

    res
      .status(200)
      .json({ ok: true, date: today, records: rows.length, ...summary });
  },
});
