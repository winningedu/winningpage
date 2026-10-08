// GET /api/cron/ai-telemetry-cleanup, AI 호출 기록 보존 기간 정리 (매일 04:30 KST)
//
// 보존 기간(365일)이 지난 ai_model_calls 와 ai_retrieval_events 행을 지운다
// (계획서 §2 12).
//
// 시각: 04:30 KST = 19:30 UTC (vercel.json crons "30 19 * * *").

import { defineHandler } from "../_lib/handler.js";
import { retentionCutoffIso } from "../_lib/telemetry/retention.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "cron",
  errorShape: "detail",
  authFailureMessage: "Unauthorized",
  unhandledMessage: "AI 호출 기록 정리 중 오류가 발생했습니다.",
  logLabel: "cron/ai-telemetry-cleanup",
  handler: async (_req, res, ctx) => {
    const cutoff = retentionCutoffIso(new Date());

    const { data: calls, error: callsError } = await ctx.supabaseAdmin
      .from("ai_model_calls")
      .delete()
      .lt("created_at", cutoff)
      .select("id");
    if (callsError) throw callsError;

    const { data: searches, error: searchesError } = await ctx.supabaseAdmin
      .from("ai_retrieval_events")
      .delete()
      .lt("created_at", cutoff)
      .select("id");
    if (searchesError) throw searchesError;

    const deletedCalls = (calls ?? []).length;
    const deletedSearches = (searches ?? []).length;
    console.log(
      `cron/ai-telemetry-cleanup cutoff=${cutoff} 모델 호출 ${deletedCalls}건, 검색 ${deletedSearches}건 삭제`,
    );

    res.status(200).json({ ok: true, cutoff, deletedCalls, deletedSearches });
  },
});
