// 본사 대시보드 API 권한 판정. 리소스 키 hqDashboard 는 data SQL(admin_resources)이 만든다.
// 판정은 console/proxy.ts 의 hasAdminViewPermission(fn_admin_effective_permissions)과 같다.

import type { SupabaseClient } from "@supabase/supabase-js";

import { hasAdminViewPermission } from "../console/proxy.js";

export const HQ_DASHBOARD_RESOURCE_KEY = "hqDashboard";

export function hasHqDashboardViewPermission(
  admin: SupabaseClient,
  profileId: string,
): Promise<boolean> {
  return hasAdminViewPermission(admin, profileId, HQ_DASHBOARD_RESOURCE_KEY);
}
