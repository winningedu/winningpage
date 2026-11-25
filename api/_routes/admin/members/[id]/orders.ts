// GET /api/admin/members/:id/orders
//
// 회원이 학생으로 또는 학부모로 걸린 주문. user_id 는 결제한 학부모라 학생 상세가 비므로 두 축을 OR 로 건다.
// id 는 .or() 필터 문자열에 들어가므로 uuid 검증을 통과한 값만 쓴다.

import { z } from "zod";
import { defineHandler } from "../../../../_lib/handler.js";
import { findMemberStub } from "../../../../_lib/members/member.js";

export const config = { runtime: "nodejs" };

const querySchema = z.object({ id: z.guid() });

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "members" },
  unhandledMessage: "주문을 불러오지 못했습니다.",
  logLabel: "[admin/members/id/orders]",
  headers: { "Cache-Control": "no-store" },
  query: querySchema,
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { id } = ctx.query;
    if (!(await findMemberStub(admin, res, id))) return;

    const { data, error } = await admin
      .from("orders")
      .select(
        "id, status, order_name, amount, list_amount, discount_amount, method, paid_at, created_at, student_profile_id, parent_profile_id",
      )
      .or(`student_profile_id.eq.${id},parent_profile_id.eq.${id}`)
      .order("created_at", { ascending: false });
    if (error) throw new Error("orders read failed");
    res.status(200).json({ items: data ?? [] });
  },
});
