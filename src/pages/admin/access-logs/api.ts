// 개인정보 접근 로그 화면의 데이터 호출. teachers 가 클라이언트에 막혀 있어 /api/admin/access-logs 로만 읽는다.

import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";

export type AccessLogKind = "view" | "edit" | "export" | "proxy";

export interface AccessLogEntry {
  id: string;
  createdAt: string;
  tenantCode: string | null;
  actorName: string | null;
  actorEmail: string | null;
  reason: string | null;
  teacherName: string | null;
  teacherLoginId: string | null;
  teacherPhone: string | null;
  kind: AccessLogKind;
  kindLabel: string;
  targetStudentName: string | null;
  content: string;
  isProxy: boolean;
}

export interface AccessLogFilter {
  tenantCode: string;
  from: string;
  to: string;
  kind: AccessLogKind | "";
  page: number;
}

export interface AccessLogPage {
  logs: AccessLogEntry[];
  page: number;
  hasNext: boolean;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export async function fetchAccessLogs(
  filter: AccessLogFilter,
): Promise<ApiResult<AccessLogPage>> {
  const params = new URLSearchParams({ page: String(filter.page) });
  if (filter.tenantCode) params.set("tenantCode", filter.tenantCode);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.kind) params.set("kind", filter.kind);

  const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
  const response = await fetch(`/api/admin/access-logs?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    return {
      ok: false,
      message:
        result?.error?.message ??
        `접근 로그를 불러오지 못했습니다. (HTTP ${response.status})`,
    };
  }
  return { ok: true, data: result as AccessLogPage };
}
