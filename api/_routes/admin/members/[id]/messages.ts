// GET /api/admin/members/:id/messages
//
// 회원에게 간 알림톡과 문자 이력(최근 100건). 크론과 수동 발송이 같은 표(alimtalk_send_logs)에 남는다.

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
  unhandledMessage: "발송 이력을 불러오지 못했습니다.",
  logLabel: "[admin/members/id/messages]",
  headers: { "Cache-Control": "no-store" },
  query: querySchema,
  handler: async (_req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { id } = ctx.query;
    if (!(await findMemberStub(admin, res, id))) return;

    const { data, error } = await admin
      .from("alimtalk_send_logs")
      .select(
        "id, template_key, channel, subject, message, status, provider_message, sent_at",
      )
      .eq("profile_id", id)
      .order("sent_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("alimtalk_send_logs read failed");
    res.status(200).json({ items: data ?? [] });
  },
});
