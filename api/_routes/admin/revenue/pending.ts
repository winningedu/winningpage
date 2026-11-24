// GET /api/admin/revenue/pending
//
// 매출 화면의 환불 대기 건수. approvalWaiting 은 승인 전, processWaiting 은 승인됐지만 실제 환불이 끝나지 않은 건이다
// (status 'completed' 가 실제 환불 완료라 그 전 단계를 센다).
// 권한: 메뉴 revenue view(defineHandler permission).

import { defineHandler } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "revenue" },
  unhandledMessage: "환불 대기 건수를 불러오지 못했어요.",
  logLabel: "[admin/revenue/pending]",
  handler: async (_req, res, ctx) => {
    const [approval, process] = await Promise.all([
      ctx.supabaseAdmin
        .from("refund_requests")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "requested"),
      ctx.supabaseAdmin
        .from("refund_requests")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "approved")
        .in("status", ["requested", "processing"]),
    ]);
    if (approval.error || process.error) {
      throw new Error("refund pending count failed");
    }

    res.status(200).json({
      approvalWaiting: approval.count ?? 0,
      processWaiting: process.count ?? 0,
    });
  },
});
