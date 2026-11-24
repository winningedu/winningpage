// POST /api/admin/sections/:key/:id/reviewed
//
// 지식 DB 행의 「검토 완료」. last_reviewed_at 한 컬럼만 지금 시각으로 고치므로 임베딩은 다시 만들지 않는다.

import {
  failWrite,
  notAllowed,
  sectionOf,
  sectionPermissionKey,
  sendNotFound,
} from "../../../../../_lib/admin-sections/query.js";
import { defineHandler } from "../../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: sectionPermissionKey },
  unhandledMessage: "섹션 데이터를 처리하지 못했습니다.",
  logLabel: "[admin/sections/reviewed]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const entry = sectionOf(req);
    if (!entry.knowledgeReview)
      notAllowed("이 섹션은 검토 완료를 쓰지 않습니다.");
    const { data, error } = await ctx.supabaseAdmin
      .from(entry.table)
      .update({ last_reviewed_at: new Date().toISOString() })
      .eq("id", String(req.query.id ?? ""))
      .select("*")
      .maybeSingle();
    if (error) {
      failWrite(res, error, "section reviewed update");
      return;
    }
    if (!data) {
      sendNotFound(res);
      return;
    }
    res.status(200).json(data);
  },
});
