// GET /api/admin/revenue/services
//
// 매출 화면의 서비스 탭 목록. products 가 정본이라 활성 상품의 service_key 를 중복 없이 { key, label } 로 돌려준다.
// 권한: 메뉴 revenue view(defineHandler permission).

import { defineHandler } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "revenue" },
  unhandledMessage: "서비스 목록을 불러오지 못했어요.",
  logLabel: "[admin/revenue/services]",
  handler: async (_req, res, ctx) => {
    const { data, error } = await ctx.supabaseAdmin
      .from("products")
      .select("service_key, service_name, service_sort_order")
      .eq("is_active", true)
      .order("service_sort_order");
    if (error) throw new Error("revenue services read failed");

    // 같은 서비스에 상품이 여럿이라 키별로 첫 행만 쓴다.
    const labels = new Map<string, string>();
    for (const row of data ?? []) {
      const key = String(row.service_key || "");
      if (key && !labels.has(key)) {
        labels.set(key, String(row.service_name || key));
      }
    }

    res.status(200).json({
      items: [...labels.entries()].map(([key, label]) => ({ key, label })),
    });
  },
});
