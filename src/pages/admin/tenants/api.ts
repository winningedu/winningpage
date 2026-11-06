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
