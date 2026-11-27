// /api/admin/revenue 루트 경로. 관리자 앱(api/_routes/admin/app.ts)이 .route("/revenue", revenue) 로 붙인다.
// 하위 경로(/pending, /services)는 아직 라우터가 받는다.
//
// GET /api/admin/revenue?from=<ISO instant Z>&to=<ISO instant Z>
//
// 어드민 매출 화면이 쓰는 매출 항목을 기간(to 는 제외)으로 읽어 { items } 로 돌려준다.
// 권한: 메뉴 revenue view(admin() 가드 permission). 1000행 한도를 넘기면 매출이 조용히 줄어 보이므로 짧은 페이지가 나올 때까지 읽는다.
// 요청 검증과 응답 모양은 shared/revenue/contract.ts 를 따른다.

import {
  type RevenueResponse,
  type RevenueRow,
  revenueQuery,
} from "../../../shared/revenue/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

const PAGE_SIZE = 1000;

const VIEW_COLUMNS =
  "order_item_id, order_id, paid_at, payer_name, payer_email, student_name, service_key, item_name, list_amount, discount_amount, paid_amount, refunded_amount, revenue_status, net_amount";

const guard = admin({
  permission: { key: "revenue" },
  unhandledMessage: "매출을 불러오지 못했어요.",
  logLabel: "[admin/revenue]",
});

export const revenue = adminFactory
  .createApp()
  .get("/", guard, validate("query", revenueQuery), async (c) => {
    const { from, to } = c.req.valid("query");
    const items: RevenueRow[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await c.var.supabaseAdmin
        .from("admin_revenue_items")
        .select(VIEW_COLUMNS)
        .gte("paid_at", from)
        .lt("paid_at", to)
        .order("paid_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error("revenue items read failed");

      const page = (data ?? []) as unknown as RevenueRow[];
      items.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return c.json({ items } satisfies RevenueResponse);
  })
  .all("/", methodNotAllowed("GET"));
