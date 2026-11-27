// /api/admin/tenant-options 아래 소속 선택지 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/tenant-options", tenantOptions) 로 붙인다.
//
// GET /api/admin/tenant-options
//
// 배너 노출 대상 select 와 회원 화면의 소속 목록(id, 이름, 기관 유형, 기타 여부, 이름순). 예전에는 브라우저가 tenants 를 직접 읽었고 경계는
// tenants select RLS(fn_admin_can('tenants','view'))였으므로 tenants 보기 권한을 그대로 요구한다.

import type { TenantOptions } from "../../../shared/tenant-options/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";

const guard = admin({
  permission: { key: "tenants", level: "view" },
  unhandledMessage: "소속 목록을 불러오지 못했습니다.",
  logLabel: "[admin/tenant-options]",
});

export const tenantOptions = adminFactory
  .createApp()
  .get("/", guard, async (c) => {
    const { data, error } = await c.var.supabaseAdmin
      .from("tenants")
      .select("id, name, org_type, is_catch_all")
      .order("name");
    if (error) throw new Error("tenants read failed");
    return c.json({ items: data ?? [] } satisfies TenantOptions);
  })
  .all("/", methodNotAllowed("GET"));
