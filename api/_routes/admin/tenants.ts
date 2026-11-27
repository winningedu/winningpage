// /api/admin/tenants 루트 경로. 관리자 앱(api/_routes/admin/app.ts)이 .route("/tenants", tenants) 로 붙인다.
// 하위 경로(/:id, member-purge 등)는 tenants-purge.ts, tenants-school-admins.ts, tenants-students.ts, tenants-detail.ts 가 같은 /tenants 에 붙어 받는다.
//
// GET  /api/admin/tenants
// POST /api/admin/tenants  { name, region, org_type, tier }
//
// 기관 관리 목록과 신규 등록(TenantsAdmin). GET 은 { items, graceDays } 를 돌려준다. 계약 칼럼은 hqTenantAdmin 사이트만 읽고,
// graceDays(app_settings.contract_grace_days)는 유예 종료일이 빈 기관의 삭제 D-day 계산용이라 그 사이트에서만 읽는다.
// POST 는 fn_create_tenant 를 관리자 본인 토큰 클라이언트로 부른다. 그 함수가 auth.uid() 로 최고 관리자를 확인하고
// created_by 를 채우므로 service_role 로는 쓸 수 없다. 최고 관리자가 아니면 DB 가 WC067 을 낸다.
// 권한: 관리자 + 메뉴 tenants(GET view, POST edit). 판정과 QA 계정 쓰기 차단은 admin() 이 한다.
// 요청 검증과 응답 모양은 shared/tenants/contract.ts 를 따른다.

import {
  createTenantBody,
  TENANT_PROBLEM_CODE,
  type TenantList,
  type TenantRow,
} from "../../../shared/tenants/contract.js";
import { SITES } from "../../../src/config/sites.js";
import { admin, userClient } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { getSiteKey } from "../../_lib/site.js";

const BASE_COLUMNS = "id, code, name, region, org_type, tier, created_at";
const HQ_COLUMNS = `${BASE_COLUMNS}, contract_start_date, contract_end_date, grace_ends_on, mou_status, is_catch_all, time_zone`;

const NOT_SUPER_ADMIN_CODE = "WC067";
const NOT_SUPER_ADMIN_MESSAGE = "최고 관리자만 소속을 등록할 수 있습니다.";

const guard = admin({
  permission: { key: "tenants" },
  unhandledMessage: "기관을 처리하지 못했습니다.",
  logLabel: "[admin/tenants]",
});

export const tenants = adminFactory
  .createApp()
  .get("/", guard, async (c) => {
    const hq = SITES[getSiteKey()].features.hqTenantAdmin;
    const { data, error } = await c.var.supabaseAdmin
      .from("tenants")
      .select(hq ? HQ_COLUMNS : BASE_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error("tenants read failed");

    let graceDays: number | null = null;
    if (hq) {
      const { data: setting, error: settingError } = await c.var.supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "contract_grace_days")
        .maybeSingle();
      if (settingError) throw new Error("grace days read failed");
      const value = (setting as { value: unknown } | null)?.value;
      graceDays = typeof value === "number" ? value : null;
    }
    return c.json({
      items: (data ?? []) as unknown as TenantRow[],
      graceDays,
    } satisfies TenantList);
  })
  .post("/", guard, validate("json", createTenantBody), async (c) => {
    const input = c.req.valid("json");

    const { data, error } = await userClient(c).rpc("fn_create_tenant", {
      p_name: input.name,
      p_region: input.region,
      p_org_type: input.org_type,
      p_tier: input.tier,
    });
    if (error?.code === NOT_SUPER_ADMIN_CODE) {
      throw new ProblemError(
        403,
        NOT_SUPER_ADMIN_MESSAGE,
        TENANT_PROBLEM_CODE.NOT_SUPER_ADMIN,
      );
    }
    if (error) throw new Error("fn_create_tenant failed");
    return c.json(data as TenantRow, 201);
  })
  .all("/", methodNotAllowed("GET", "POST"));
