// 본사 기관 화면의 서버 호출. 기관, 서비스 설정, 전체 관리자는 api(ky)로 부르고 응답을 zod 로 검사한다.
// 아래쪽 call 기반 함수(학생 이용 현황, 회원 삭제)는 다른 화면이 쓰며 이 파일에서 걷어낼 예정이다.

import { z } from "zod";
import { api } from "@/lib/http/client";
import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
import type { tenantPayload } from "./form";
import type { SettingRow, UsageDefaults } from "./serviceSettings";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

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

export interface StudentUsageProgram {
  programKey: string;
  allowed: boolean;
  denyReason: string | null;
  monthUsed: number;
  monthLimit: number | null;
  monthRemaining: number | null;
  termUsed: number;
  termLimit: number | null;
  termRemaining: number | null;
  monthResetsOn: string | null;
  termResetsOn: string | null;
  setting: {
    enabled: boolean;
    monthlyLimit: number | null;
    termLimit: number | null;
  } | null;
  override: { monthlyLimit: number | null; termLimit: number | null } | null;
}

export interface StudentUsage {
  tenant: { id: string; name: string; isCatchAll: boolean } | null;
  programs: StudentUsageProgram[];
}

async function call<T>(
  url: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<ApiResult<T>> {
  const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
  const response = await fetch(url, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    const message =
      result?.error?.message ??
      `요청에 실패했습니다. (HTTP ${response.status})`;
    return { ok: false, message: String(message) };
  }
  return { ok: true, data: result as T };
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

export function fetchStudentUsage(
  profileId: string,
): Promise<ApiResult<StudentUsage>> {
  return call<StudentUsage>(
    `/api/admin/tenants/student-usage?profileId=${encodeURIComponent(profileId)}`,
    { method: "GET" },
  );
}
export interface PurgePreviewStudent {
  id: string;
  /** 서버가 가린 이름이다("김*늘"). */
  name: string;
  grade: string | null;
  classLabel: string | null;
  number: number | null;
  protected: boolean;
}

export interface PurgePreview {
  contractEnd: string | null;
  graceEnd: string | null;
  deletableFrom: string | null;
  /** 삭제 가능일까지 남은 날. 0 이하면 지금 지울 수 있다. */
  dDay: number | null;
  students: PurgePreviewStudent[];
}

export interface PurgeResult {
  deleted: number;
  excluded: number;
  skipped: number;
  notProcessed: number;
}

export interface PurgeLogEntry {
  id: string;
  executedAt: string;
  executedBy: string | null;
  tenant: { id: string | null; code: string; name: string } | null;
  contractEndDate: string | null;
  deletedCount: number;
  excludedCount: number;
  skippedCount: number;
  memberIds: string[];
}

export function fetchMemberPurgePreview(
  tenantId: string,
): Promise<ApiResult<PurgePreview>> {
  return call<PurgePreview>(
    `/api/admin/tenants/member-purge-preview?tenantId=${encodeURIComponent(tenantId)}`,
    { method: "GET" },
  );
}

export function runMemberPurge(body: {
  tenantId: string;
  targetIds: string[];
}): Promise<ApiResult<PurgeResult>> {
  return call<PurgeResult>("/api/admin/tenants/member-purge", {
    method: "POST",
    body,
  });
}

export function fetchPurgeLogs(): Promise<
  ApiResult<{ logs: PurgeLogEntry[] }>
> {
  return call<{ logs: PurgeLogEntry[] }>("/api/admin/tenants/purge-logs", {
    method: "GET",
  });
}
