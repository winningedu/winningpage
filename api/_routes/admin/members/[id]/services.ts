// GET /api/admin/members/:id/services
//
// 회원의 이용권(program_access, id 가 회원 id 다). 상세 화면의 이용서비스 표가 쓴다.

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
  unhandledMessage: "이용권을 불러오지 못했습니다.",
  logLabel: "[admin/members/id/services]",
  headers: { "Cache-Control": "no-store" },
  query: querySchema,
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { id } = ctx.query;
    if (!(await findMemberStub(admin, res, id))) return;

    const { data, error } = await admin
      .from("program_access")
      .select(
        "id, program_key, payment_status, access_status, paid_amount, starts_at, expires_at, access_started_at, access_expires_at",
      )
      .eq("id", id);
    if (error) throw new Error("program_access read failed");
    res.status(200).json({ items: data ?? [] });
  },
});
