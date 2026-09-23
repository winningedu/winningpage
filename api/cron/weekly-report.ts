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
// 학생 1명분 발송(dedupeKey·변수 조립·sendAndLog)은 api/_lib/goalReportSend.ts
// 의 sendWeeklyReportFor 로 옮겼다 — 관리자 재발송(api/goal/admin/resend-report.ts)
// 이 같은 로직을 재사용한다. 이 파일은 "지난 주 기록을 남긴 학생이 누구인지"
// 골라 그 함수를 호출하는 역할만 한다.

import { kstNow, mondayOf, toYmd } from "../_lib/goalReportNotify.js";
import { sendWeeklyReportFor } from "../_lib/goalReportSend.js";
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

    const { data: records, error } = await supabaseAdmin
      .from("goal_daily_records")
      .select("profile_id")
      .gte("record_date", weekStart)
      .lte("record_date", weekEnd);

    if (error) {
      console.error("cron/weekly-report 기록 조회 실패:", error);
      res.status(500).json({ detail: error.message });
      return;
    }

    const studentIds = Array.from(
      new Set((records || []).map((r) => String(r.profile_id))),
    );

    if (studentIds.length === 0) {
      res.status(200).json({ ok: true, weekStart, students: 0 });
      return;
    }

    const summary = { sent: 0, failed: 0, skipped: 0 };

    for (const studentId of studentIds) {
      const result = await sendWeeklyReportFor(
        supabaseAdmin,
        studentId,
        weekStart,
      );

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
      `cron/weekly-report ${weekStart}~${weekEnd} — 학생 ${studentIds.length}명, ${JSON.stringify(summary)}`,
    );

    res.status(200).json({
      ok: true,
      weekStart,
      weekEnd,
      students: studentIds.length,
      ...summary,
    });
  },
});
