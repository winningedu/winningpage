// 본사 기관 화면의 서버 호출. 기관, 서비스 설정, 전체 관리자는 api(ky)로 부르고 응답을 zod 로 검사한다.

import { z } from "zod";
import { api } from "@/lib/http/client";
import type { tenantPayload } from "./form";
import type { SettingRow, UsageDefaults } from "./serviceSettings";

const nullableText = z.string().nullable();

export const tenantRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  region: z.string(),
  org_type: z.string(),
  tier: z.string(),
  created_at: z.string(),
  // 아래 열은 스쿨멘토(hqTenantAdmin)에서만 온다.
  contract_start_date: nullableText.optional(),
  contract_end_date: nullableText.optional(),
  grace_ends_on: nullableText.optional(),
  mou_status: nullableText.optional(),
  is_catch_all: z.boolean().optional(),
  time_zone: z.string().optional(),
});
export type TenantRow = z.infer<typeof tenantRowSchema>;

const tenantListSchema = z.object({
  items: z.array(tenantRowSchema),
  graceDays: z.number().nullable(),
});
export type TenantList = z.infer<typeof tenantListSchema>;

export interface CreateTenantBody {
  name: string;
  region: string;
  org_type: string;
  tier: string;
}

export function fetchTenants(signal?: AbortSignal): Promise<TenantList> {
  return api.get("admin/tenants", { signal }).json(tenantListSchema);
}

export function createTenant(body: CreateTenantBody): Promise<TenantRow> {
  return api.post("admin/tenants", { json: body }).json(tenantRowSchema);
}

const tenantDetailSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  region: z.string(),
  org_type: z.string(),
  tier: z.string(),
  contract_start_date: nullableText,
  contract_end_date: nullableText,
  term_months: z.number().nullable(),
  mou_status: nullableText,
  grace_ends_on: nullableText,
  trial_start_date: nullableText,
  trial_end_date: nullableText,
  contact_name: nullableText,
  contact_phone: nullableText,
  contact_mobile: nullableText,
  contact_email: nullableText,
  address: nullableText,
  main_phone: nullableText,
  homepage: nullableText,
  is_catch_all: z.boolean(),
  updated_at: z.string(),
});
export type TenantDetailRow = z.infer<typeof tenantDetailSchema>;

export function fetchTenantDetail(
  id: string,
  signal?: AbortSignal,
): Promise<TenantDetailRow> {
  return api
    .get("admin/tenants/detail", { searchParams: { id }, signal })
    .json(tenantDetailSchema);
}

const tenantSavedSchema = z.object({ id: z.string(), updated_at: z.string() });

export interface PatchTenantBody {
  id: string;
  /** 불러올 때의 updated_at. 그 사이 다른 관리자가 고쳤으면 서버가 409 로 막는다. */
  updatedAt: string;
  values: ReturnType<typeof tenantPayload>;
}

export function patchTenant(
  body: PatchTenantBody,
): Promise<z.infer<typeof tenantSavedSchema>> {
  return api
    .patch("admin/tenants/detail", { json: body })
    .json(tenantSavedSchema);
}

const settingRowSchema = z.object({
  program_key: z.string(),
  enabled: z.boolean(),
  starts_on: nullableText,
  ends_on: nullableText,
  monthly_limit: z.number().nullable(),
  term_limit: z.number().nullable(),
});

const usageDefaultsSchema = z.record(
  z.string(),
  z.object({
    monthly_limit: z.number().optional(),
    term_limit_by_term_months: z.record(z.string(), z.number()).optional(),
  }),
);

const serviceSettingsSchema = z.object({
  items: z.array(settingRowSchema),
  defaults: usageDefaultsSchema,
});

export function fetchServiceSettings(
  tenantId: string,
  signal?: AbortSignal,
): Promise<{ items: SettingRow[]; defaults: UsageDefaults }> {
  return api
    .get("admin/tenants/service-settings", {
      searchParams: { tenantId },
      signal,
    })
    .json(serviceSettingsSchema);
}

/** 한 행의 upsert 본문. 변경자(updated_by)는 서버가 세션에서 채운다. */
export interface ServiceSettingBody {
  tenant_id: string;
  program_key: string;
  enabled: boolean;
  starts_on: string | null;
  ends_on: string | null;
  monthly_limit: number | null;
  term_limit: number | null;
  updated_at: string;
}

export function putServiceSetting(body: ServiceSettingBody): Promise<unknown> {
  return api
    .put("admin/tenants/service-settings", { json: body })
    .json(z.looseObject({}));
}

const schoolAdminListSchema = z.object({
  address: nullableText,
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string(),
      landline: nullableText,
      email: nullableText,
      position: nullableText,
      loginId: nullableText,
      status: z.enum(["active", "inactive"]),
      issuedAt: z.string(),
      canceledAt: nullableText,
    }),
  ),
});
export type SchoolAdminList = z.infer<typeof schoolAdminListSchema>;

export interface IssueSchoolAdminBody {
  tenantId: string;
  name: string;
  phone: string;
  landline?: string;
  email?: string;
  position?: string;
}

export interface IssuedSchoolAdmin {
  loginId: string;
  tempPassword?: string | undefined;
}

export function fetchSchoolAdmins(
  tenantId: string,
  signal?: AbortSignal,
): Promise<SchoolAdminList> {
  return api
    .get("admin/tenants/school-admins", { searchParams: { tenantId }, signal })
    .json(schoolAdminListSchema);
}

const issuedSchoolAdminSchema = z.object({
  loginId: z.string(),
  tempPassword: z.string().optional(),
});

export function issueSchoolAdmin(
  body: IssueSchoolAdminBody,
): Promise<IssuedSchoolAdmin> {
  return api
    .post("admin/tenants/school-admin", { json: body })
    .json(issuedSchoolAdminSchema);
}
