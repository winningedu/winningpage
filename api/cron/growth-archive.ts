// GET /api/cron/growth-archive — 미완 성장설계 회차 보관 처리 (매일 04:00 KST)
//
// 마지막 활동 후 REPORT_EXPIRY_DAYS(90일)가 지난 draft / in_progress 회차를
// archived 로 바꾼다(명세 No.115, No.139). 완료된 회차는 건드리지 않는다.
//
// 시각: 04:00 KST = 19:00 UTC (vercel.json crons "0 19 * * *").

import { defineHandler } from "../_lib/handler.js";
import { REPORT_EXPIRY_DAYS } from "../_lib/growth/session.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "cron",
  errorShape: "detail",
  authFailureMessage: "Unauthorized",
  unhandledMessage: "성장설계 미완 회차 보관 처리 중 오류가 발생했습니다.",
  logLabel: "cron/growth-archive",
  handler: async (_req, res, ctx) => {
    const cutoff = new Date(
      Date.now() - REPORT_EXPIRY_DAYS * 86_400_000,
    ).toISOString();

    const { data, error } = await ctx.supabaseAdmin
      .from("growth_reports")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .in("status", ["draft", "in_progress"])
      .lt("last_activity_at", cutoff)
      .select("id");

    if (error) throw error;

    const ids = (data ?? []).map((row: { id: string }) => row.id);
    console.log(`cron/growth-archive cutoff=${cutoff} 보관 ${ids.length}건`);

    res.status(200).json({ ok: true, archived: ids.length, ids });
  },
});
