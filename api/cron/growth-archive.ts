// GET /api/cron/growth-archive, 미완 성장설계 회차 보관 처리 (매일 04:00 KST)
//
// 마지막 활동 후 REPORT_EXPIRY_DAYS(90일)가 지난 draft / in_progress 회차를
// archived 로 바꾼다(명세 No.115, No.139). 완료된 회차는 건드리지 않는다.
//
// 시각: 04:00 KST = 19:00 UTC (vercel.json crons "0 19 * * *").

import { ALLOWED_UPLOAD_MIME } from "../_lib/growth/intake/extraction.js";
import { REPORT_EXPIRY_DAYS } from "../_lib/growth/session.js";
import { defineHandler } from "../_lib/handler.js";

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

    // 업로드 고아 스윕: 24시간 넘게 pending/processing 으로 남은 행과 객체를 정리한다.
    const uploadCutoff = new Date(Date.now() - 86_400_000).toISOString();
    const { data: stale, error: staleError } = await ctx.supabaseAdmin
      .from("growth_uploads")
      .select("id, profile_id, mime_type")
      .in("extraction_status", ["pending", "processing"])
      .lt("created_at", uploadCutoff)
      .limit(200);

    if (staleError) throw staleError;

    const staleRows = (stale ?? []) as {
      id: string;
      profile_id: string;
      mime_type: string;
    }[];
    let uploadsSwept = 0;

    if (staleRows.length > 0) {
      const paths: string[] = [];
      for (const row of staleRows) {
        const ext = ALLOWED_UPLOAD_MIME[row.mime_type];
        if (ext !== undefined) paths.push(`${row.profile_id}/${row.id}.${ext}`);
      }

      if (paths.length > 0) {
        const { error: removeError } = await ctx.supabaseAdmin.storage
          .from("growth-uploads")
          .remove(paths);
        if (removeError) {
          console.error(
            "cron/growth-archive 업로드 객체 삭제 실패",
            removeError,
          );
        }
      }

      const { data: swept, error: sweepError } = await ctx.supabaseAdmin
        .from("growth_uploads")
        .update({
          extraction_status: "failed",
          extraction_error: "미처리 만료",
          updated_at: new Date().toISOString(),
        })
        .in(
          "id",
          staleRows.map((row) => row.id),
        )
        .select("id");

      if (sweepError) throw sweepError;
      uploadsSwept = (swept ?? []).length;
    }
    console.log(`cron/growth-archive 업로드 고아 ${uploadsSwept}건`);

    res.status(200).json({ ok: true, archived: ids.length, ids, uploadsSwept });
  },
});
