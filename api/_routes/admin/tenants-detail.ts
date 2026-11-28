// /api/admin/tenants/:id 아래 기관 상세와 서비스 설정 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/tenants", tenantsDetail) 로 붙인다.
// 목록과 등록(/)은 tenants.ts 가, 글자 그대로인 경로(/member-purge, /school-admin, /student-usage 등)는 tenants-purge, tenants-school-admins, tenants-students 가 맡고,
// 앱에서 이 파일을 그 뒤에 붙인다. 그래야 아래 .all("/:id", methodNotAllowed(...)) 가 그 경로를 405 로 가로채지 않는다.
// 요청 검증과 응답 모양은 shared/tenants/detail.ts 를 따른다.
//
// GET /:id: 기관 한 곳의 행. PATCH /:id { updatedAt, values }: 화면이 불러온 updated_at 이 그대로일 때만 고친다(낙관적 잠금).
//   고칠 칸은 values 의 목록뿐이라 소속 코드(code)와 기타 기관 표시(is_catch_all)는 쓸 수 없다. 날짜 순서는 DB 제약
//   (tenants_contract_order, tenants_grace_after_end, tenants_trial_order)이 막고 위반하면 400 으로 알린다.
//   수정은 관리자 본인 토큰 클라이언트로 한다. 계약 칼럼 변경 이력 트리거가 auth.uid() 를 변경자로 남기고, RLS 가 메뉴 권한이다.
// GET /:id/service-settings: 기관 서비스 설정 탭(ServiceSettingsPanel, 사 #160, #164, #166, 결정 r5, r6)이 읽는 서비스별 설정 행과, 켤 때 한도를 미리 채우는
//   app_settings.b2b_usage_defaults. PUT 은 한 서비스 행을 upsert 한다(끄기도 enabled false 로 행을 둔다, DELETE 권한이 없다).
//   쓰기는 관리자 본인 토큰 클라이언트로 한다. 변경 이력 트리거(fn_log_settings_change)가 auth.uid() 를 변경자로 남기고 RLS 가 메뉴 권한이다.
// 권한: 관리자 + 메뉴 tenants(GET view, 쓰기 edit).

import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import {
  patchTenantBody,
  putServiceSettingBody,
  type ServiceSettings,
  type SettingRowDto,
  TENANT_DETAIL_ERROR,
  type TenantDetailRow,
  type TenantSaved,
  tenantIdParams,
  usageDefaultsSchema,
} from "../../../shared/tenants/detail.js";
import { admin, userClient } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import {
  methodNotAllowed,
  notFound,
  ProblemError,
} from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { SERVICE_CREDIT_PROGRAMS } from "../../_lib/service-credit/programs.js";

const TENANT_COLUMNS =
  "id, code, name, region, org_type, tier, contract_start_date, contract_end_date, term_months, mou_status, grace_ends_on, trial_start_date, trial_end_date, contact_name, contact_phone, contact_mobile, contact_email, address, main_phone, homepage, is_catch_all, updated_at";

const SETTING_COLUMNS =
  "program_key, enabled, starts_on, ends_on, monthly_limit, term_limit";

// 화면(src/pages/admin/tenants/form.ts)과 같은 문구다.
const CONFLICT_MESSAGE =
  "다른 관리자가 먼저 고쳤어요. 새로 불러온 뒤 다시 저장해 주세요.";
const FORBIDDEN_MESSAGE = "저장하지 못했어요. 기관 수정 권한을 확인해 주세요.";
const CHECK_VIOLATIONS = [
  {
    constraint: "tenants_contract_order",
    code: TENANT_DETAIL_ERROR.CONTRACT_ORDER,
    message: "계약 시작일은 종료일보다 늦을 수 없어요.",
  },
  {
    constraint: "tenants_grace_after_end",
    code: TENANT_DETAIL_ERROR.GRACE_ORDER,
    message: "유예 종료일은 계약 종료일과 같거나 그 뒤여야 해요.",
  },
  {
    constraint: "tenants_trial_order",
    code: TENANT_DETAIL_ERROR.TRIAL_ORDER,
    message: "시범 시작일은 종료일보다 늦을 수 없어요.",
  },
];

// program_key 가 서비스 목록 안에 있는지는 목록이 있는 서버에서 더 본다.
const putServiceSetting = putServiceSettingBody.superRefine((row, ctx) => {
  if (
    !SERVICE_CREDIT_PROGRAMS.some(
      (program) => program.programKey === row.program_key,
    )
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["program_key"],
      message: "Invalid input",
    });
  }
});

const tenantByIdGuard = admin({
  permission: { key: "tenants" },
  unhandledMessage: "기관 정보를 처리하지 못했습니다.",
  logLabel: "[admin/tenants/id]",
});
const serviceSettingsGuard = admin({
  permission: { key: "tenants" },
  unhandledMessage: "서비스 설정을 처리하지 못했습니다.",
  logLabel: "[admin/tenants/id/service-settings]",
});

export const tenantsDetail = adminFactory
  .createApp()
  .get(
    "/:id",
    tenantByIdGuard,
    validate("param", tenantIdParams),
    async (c) => {
      const { data, error } = await c.var.supabaseAdmin
        .from("tenants")
        .select(TENANT_COLUMNS)
        .eq("id", c.req.valid("param").id)
        .maybeSingle();
      if (error) throw new Error("tenant read failed");
      if (!data) throw notFound("기관");
      return c.json(data satisfies TenantDetailRow);
    },
  )
  // 본문보다 경로 id 를 먼저 검증해 잘못된 주소면 쓰기 전에 막는다.
  .patch(
    "/:id",
    tenantByIdGuard,
    validate("param", tenantIdParams),
    validate("json", patchTenantBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const { updatedAt, values } = c.req.valid("json");

      const { data, error } = await userClient(c)
        .from("tenants")
        .update(values)
        .eq("id", id)
        .eq("updated_at", updatedAt)
        .select("id, updated_at");
      if (error) {
        const violation =
          error.code === "23514"
            ? CHECK_VIOLATIONS.find((item) =>
                error.message.includes(item.constraint),
              )
            : undefined;
        if (violation) {
          throw new ProblemError(400, violation.message, violation.code);
        }
        throw new Error("tenant update failed");
      }

      const [saved] = data ?? [];
      if (saved) return c.json(saved satisfies TenantSaved);

      // 0행은 기관이 없거나, 그 사이 다른 관리자가 먼저 저장했거나, 수정 권한이 없는 경우다. 다시 읽어 구분한다.
      const { data: current, error: readError } = await c.var.supabaseAdmin
        .from("tenants")
        .select("updated_at")
        .eq("id", id)
        .maybeSingle();
      if (readError) throw new Error("tenant reread failed");
      if (!current) throw notFound("기관");
      if ((current as { updated_at: string }).updated_at !== updatedAt) {
        throw new ProblemError(409, CONFLICT_MESSAGE, PROBLEM_CODE.CONFLICT);
      }
      throw new ProblemError(403, FORBIDDEN_MESSAGE, PROBLEM_CODE.FORBIDDEN);
    },
  )
  .all("/:id", methodNotAllowed("GET", "PATCH"))
  .get(
    "/:id/service-settings",
    serviceSettingsGuard,
    validate("param", tenantIdParams),
    async (c) => {
      const tenantId = c.req.valid("param").id;
      const [settings, defaultRow] = await Promise.all([
        c.var.supabaseAdmin
          .from("tenant_service_settings")
          .select(SETTING_COLUMNS)
          .eq("tenant_id", tenantId),
        c.var.supabaseAdmin
          .from("app_settings")
          .select("value")
          .eq("key", "b2b_usage_defaults")
          .maybeSingle(),
      ]);
      if (settings.error || defaultRow.error) {
        throw new Error("service settings read failed");
      }
      const value = (defaultRow.data as { value: unknown } | null)?.value;
      return c.json({
        items: settings.data ?? [],
        defaults: usageDefaultsSchema.parse(
          value !== null && typeof value === "object" && !Array.isArray(value)
            ? value
            : {},
        ),
      } satisfies ServiceSettings);
    },
  )
  .put(
    "/:id/service-settings",
    serviceSettingsGuard,
    validate("param", tenantIdParams),
    validate("json", putServiceSetting),
    async (c) => {
      const tenantId = c.req.valid("param").id;
      const {
        tenant_id: _tenant,
        id: _id,
        created_at: _created,
        updated_at: _updatedAt,
        updated_by: _updatedBy,
        ...row
      } = c.req.valid("json");

      const { data, error } = await userClient(c)
        .from("tenant_service_settings")
        .upsert(
          {
            ...row,
            tenant_id: tenantId, // 본문에 tenant_id 가 섞여 와도 스키마가 버려 경로 값만 남는다
            updated_by: c.var.userId as string,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,program_key" },
        )
        .select(SETTING_COLUMNS)
        .single();
      // 없는 기관이면 FK 위반이다.
      if (error?.code === "23503") throw notFound("기관");
      if (error) throw new Error("service setting upsert failed");
      return c.json(data satisfies SettingRowDto);
    },
  )
  .all("/:id/service-settings", methodNotAllowed("GET", "PUT"));
