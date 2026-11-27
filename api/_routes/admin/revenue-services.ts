// GET /api/admin/revenue/services 매출 화면의 서비스 탭 목록. 관리자 앱(api/_routes/admin/app.ts)이 .route("/revenue", revenueServices) 로 붙인다.
// 매출 목록(루트 경로)은 api/_routes/admin/revenue.ts 가 맡는다. 응답 모양은 shared/revenue/services.ts 를 따른다.
// products 가 정본이라 활성 상품의 service_key 를 중복 없이 { key, label } 로 돌려준다. 권한: 메뉴 revenue view.

import type { RevenueServices } from "../../../shared/revenue/services.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";

const guard = admin({
  permission: { key: "revenue" },
  unhandledMessage: "서비스 목록을 불러오지 못했어요.",
  logLabel: "[admin/revenue/services]",
});

export const revenueServices = adminFactory
  .createApp()
  .get("/services", guard, async (c) => {
    const { data, error } = await c.var.supabaseAdmin
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
    return c.json({
      items: [...labels.entries()].map(([key, label]) => ({ key, label })),
    } satisfies RevenueServices);
  })
  .all("/services", methodNotAllowed("GET"));
