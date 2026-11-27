// 본사 기관 화면의 서버 호출. 기관, 서비스 설정, 전체 관리자는 api(ky)로 부르고 응답을 shared/tenant/contract.ts 의 스키마로 검사한다.

import { api } from "@/lib/http/client";
import {
  type CreateTenantInput,
  type IssuedSchoolAdmin,
  type IssueSchoolAdminInput,
  issuedSchoolAdminSchema,
  type PatchTenantInput,
  type PutServiceSettingInput,
  type SchoolAdminList,
  type ServiceSettings,
  schoolAdminListSchema,
  serviceSettingsSchema,
  settingRowSchema,
  type TenantDetailRow,
  type TenantList,
  type TenantRow,
  type TenantSaved,
  tenantDetailSchema,
  tenantListSchema,
  tenantRowSchema,
  tenantSavedSchema,
} from "../../../../shared/tenant/contract.js";

export type {
  IssuedSchoolAdmin,
  IssueSchoolAdminInput,
  SchoolAdminList,
  TenantDetailRow,
  TenantList,
  TenantRow,
};

export function fetchTenants(signal?: AbortSignal): Promise<TenantList> {
  return api.get("admin/tenants", { signal }).json(tenantListSchema);
}

export function createTenant(body: CreateTenantInput): Promise<TenantRow> {
  return api.post("admin/tenants", { json: body }).json(tenantRowSchema);
}

export function fetchTenantDetail(
  id: string,
  signal?: AbortSignal,
): Promise<TenantDetailRow> {
  return api
    .get(`admin/tenants/${encodeURIComponent(id)}`, { signal })
    .json(tenantDetailSchema);
}

/** id 는 경로로 가고 본문에는 싣지 않는다. updatedAt 은 불러올 때의 값이라 그 사이 다른 관리자가 고쳤으면 서버가 409 로 막는다. */
export type PatchTenantBody = PatchTenantInput & { id: string };

export function patchTenant(body: PatchTenantBody): Promise<TenantSaved> {
  const { id, ...json } = body;
  return api
    .patch(`admin/tenants/${encodeURIComponent(id)}`, { json })
    .json(tenantSavedSchema);
}

export function fetchServiceSettings(
  tenantId: string,
  signal?: AbortSignal,
): Promise<ServiceSettings> {
  return api
    .get(`admin/tenants/${encodeURIComponent(tenantId)}/service-settings`, {
      signal,
    })
    .json(serviceSettingsSchema);
}

/** 한 행의 upsert 본문. 변경자(updated_by)는 서버가 세션에서 채운다. tenant_id 는 경로로 가고 본문에는 싣지 않는다. */
export type ServiceSettingBody = PutServiceSettingInput & { tenant_id: string };

export function putServiceSetting(body: ServiceSettingBody) {
  const { tenant_id: tenantId, ...json } = body;
  return api
    .put(`admin/tenants/${encodeURIComponent(tenantId)}/service-settings`, {
      json,
    })
    .json(settingRowSchema);
}

export function fetchSchoolAdmins(
  tenantId: string,
  signal?: AbortSignal,
): Promise<SchoolAdminList> {
  return api
    .get("admin/tenants/school-admins", { searchParams: { tenantId }, signal })
    .json(schoolAdminListSchema);
}

export function issueSchoolAdmin(
  body: IssueSchoolAdminInput,
): Promise<IssuedSchoolAdmin> {
  return api
    .post("admin/tenants/school-admin", { json: body })
    .json(issuedSchoolAdminSchema);
}
