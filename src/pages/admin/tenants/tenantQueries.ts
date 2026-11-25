// 기관 화면이 함께 쓰는 react-query 키와 오류 문구.

import { queryOptions } from "@tanstack/react-query";
import { ApiError } from "@/lib/http/client";
import { fetchSchoolAdmins } from "./api";

const ROOT = ["admin", "tenants"] as const;

export const tenantKeys = {
  all: ROOT,
  list: () => [...ROOT, "list"] as const,
  detail: (id: string) => [...ROOT, "detail", id] as const,
  serviceSettings: (id: string) => [...ROOT, "service-settings", id] as const,
  schoolAdmins: (id: string) => [...ROOT, "school-admins", id] as const,
};

/** 전체 관리자 목록. 기관 상세가 응답을 기다리는 동안에도 시작하도록 둘이 같은 옵션을 쓴다. */
export function schoolAdminsQueryOptions(tenantId: string) {
  return queryOptions({
    queryKey: tenantKeys.schoolAdmins(tenantId),
    queryFn: ({ signal }) => fetchSchoolAdmins(tenantId, signal),
  });
}

export type TenantTab = "info" | "service-settings" | "school-admins";

/** 기관 화면의 브라우저 주소. 상세와 탭은 주소가 곧 화면이다. */
export const tenantPaths = {
  list: "/admin/tenants",
  create: "/admin/tenants/new",
  detail: (id: string) => `/admin/tenants/${id}`,
  tab: (id: string, tab: TenantTab) =>
    tab === "info" ? `/admin/tenants/${id}` : `/admin/tenants/${id}/${tab}`,
};

/** 화면에 보일 문구. 서버가 쓴 한국어 detail 이 있으면 그대로, 없으면 일반 안내다. */
export function errorDetail(error: unknown): string {
  return error instanceof ApiError ? error.detail : "요청을 처리하지 못했어요.";
}
