// 본사 대시보드 서버 호출(api/admin/hq-dashboard/*). Bearer 토큰으로 부르고 실패는 던져 useQuery 가 오류로 받는다.

import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";

export type ContractStatus =
  | "none"
  | "upcoming"
  | "active"
  | "ending_soon"
  | "grace"
  | "expired";

export interface HqSummary {
  asOf: string;
  tenantCount: number;
  studentCount: number;
  studentWithoutEnrollmentCount: number;
  teacherCount: number;
  contracts: {
    none: number;
    upcoming: number;
    active: number;
    endingSoon: number;
    grace: number;
    expired: number;
  };
}

export interface HqTenantRow {
  tenantId: string;
  name: string;
  region: string;
  orgType: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  graceEnd: string | null;
  contractStatus: ContractStatus;
  studentCount: number;
  /** 학적이 없는 학생 수. 화면은 "학년, 반 미상"으로 보인다. */
  studentWithoutEnrollmentCount: number;
  teacherCount: number;
  lastActivityOn: string | null;
  goalRateAverage: number | null;
  goalUserCount: number;
}

export interface HqTenants {
  asOf: string;
  tenants: HqTenantRow[];
}

async function getJson<T>(path: string, includeInternal: boolean): Promise<T> {
  const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
  const response = await fetch(
    `${path}?includeInternal=${includeInternal ? "1" : "0"}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(
      String(
        result?.error?.message ??
          `요청에 실패했습니다. (HTTP ${response.status})`,
      ),
    );
  }
  return result as T;
}

export function fetchHqSummary(includeInternal: boolean): Promise<HqSummary> {
  return getJson<HqSummary>("/api/admin/hq-dashboard/summary", includeInternal);
}

export function fetchHqTenants(includeInternal: boolean): Promise<HqTenants> {
  return getJson<HqTenants>("/api/admin/hq-dashboard/tenants", includeInternal);
}
