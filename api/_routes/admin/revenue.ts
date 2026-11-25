// GET /api/admin/revenue?from=<ISO instant Z>&to=<ISO instant Z>
//
// 어드민 매출 화면이 쓰는 매출 항목을 기간(to 는 제외)으로 읽어 { items } 로 돌려준다.
// 권한: 메뉴 revenue view(defineHandler permission). 1000행 한도를 넘기면 매출이 조용히 줄어 보이므로 짧은 페이지가 나올 때까지 읽는다.

import { z } from "zod";
import { defineHandler } from "../../_lib/handler.js";

export const config = { runtime: "nodejs" };

const PAGE_SIZE = 1000;

const VIEW_COLUMNS =
  "order_item_id, order_id, paid_at, payer_name, payer_email, student_name, service_key, item_name, list_amount, discount_amount, paid_amount, refunded_amount, revenue_status, net_amount";

const querySchema = z
  .object({ from: z.iso.datetime(), to: z.iso.datetime() })
  .refine((value) => Date.parse(value.from) < Date.parse(value.to), {
    message: "from 은 to 보다 앞이어야 합니다.",
    path: ["from"],
  });

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "revenue" },
  unhandledMessage: "매출을 불러오지 못했어요.",
  logLabel: "[admin/revenue]",
  query: querySchema,
  handler: async (_req, res, ctx) => {
    const { from, to } = ctx.query;
    const items: unknown[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await ctx.supabaseAdmin
        .from("admin_revenue_items")
        .select(VIEW_COLUMNS)
        .gte("paid_at", from)
        .lt("paid_at", to)
        .order("paid_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error("revenue items read failed");

      const page = data ?? [];
      items.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    res.status(200).json({ items });
  },
});
