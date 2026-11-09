// 본사 기관 상세의 서버 호출. 쓰기는 모두 서버 경로(api/admin/tenants/*)이고 Bearer 토큰으로 부른다.

import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export interface SchoolAdminRow {
  id: string;
  name: string;
  phone: string;
  landline: string | null;
  email: string | null;
  position: string | null;
  loginId: string | null;
  status: "active" | "inactive";
  issuedAt: string;
  canceledAt: string | null;
}

export interface SchoolAdminList {
  address: string | null;
  admins: SchoolAdminRow[];
}

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
  tempPassword?: string;
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
): Promise<ApiResult<SchoolAdminList>> {
  return call<SchoolAdminList>(
    `/api/admin/tenants/school-admins?tenantId=${encodeURIComponent(tenantId)}`,
    { method: "GET" },
  );
}

export function issueSchoolAdmin(
  body: IssueSchoolAdminBody,
): Promise<ApiResult<IssuedSchoolAdmin>> {
  return call<IssuedSchoolAdmin>("/api/admin/tenants/school-admin", {
    method: "POST",
    body,
  });
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
