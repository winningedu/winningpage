// GET /api/admin/admission/results/count
//
// 입결정보(admission_results) 전체 행 수. 행을 내려받지 않고 head 로 센다.

import { defineHandler } from "../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "admissionResults" },
  unhandledMessage: "입결정보 건수를 읽지 못했습니다.",
  logLabel: "[admin/admission/results/count]",
  handler: async (_req, res, ctx) => {
    const { count, error } = await ctx.supabaseAdmin
      .from("admission_results")
      .select("id", { count: "exact", head: true });
    if (error || typeof count !== "number") {
      throw new Error("admission_results count failed");
    }
    res.status(200).json({ total: count });
  },
});
