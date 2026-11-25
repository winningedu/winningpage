// GET /api/admin/tenant-options
//
// 배너 노출 대상 select 와 회원 화면의 소속 목록(id, 이름, 기관 유형, 기타 여부, 이름순). 예전에는 브라우저가 tenants 를 직접 읽었고 경계는
// tenants select RLS(fn_admin_can('tenants','view'))였으므로 tenants 보기 권한을 그대로 요구한다.

import { defineHandler } from "../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "tenants", level: "view" },
  unhandledMessage: "소속 목록을 불러오지 못했습니다.",
  logLabel: "[admin/tenant-options]",
  handler: async (_req, res, ctx) => {
    const { data, error } = await ctx.supabaseAdmin
      .from("tenants")
      .select("id, name, org_type, is_catch_all")
      .order("name");
    if (error) throw new Error("tenants read failed");
    res.status(200).json({ items: data ?? [] });
  },
});
