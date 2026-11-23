// 본사 대시보드 서버 호출(api/admin/hq-dashboard/*). Bearer 토큰으로 부르고 실패는 던져 useQuery 가 오류로 받는다.

import { apiFetch } from "@/lib/apiFetch";
import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";

export type ContractStatus =
  | "trial"
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
    trial: number;
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
  trialStartDate: string | null;
  trialEndDate: string | null;
  /** trial 은 시범기간 안이고 계약 기간(active, ending_soon) 밖인 기관(결정 117). */
  contractStatus: ContractStatus;
  studentCount: number;
  /** 학적이 없는 학생 수. 화면은 "학년, 반 미상"으로 보인다. */
  studentWithoutEnrollmentCount: number;
  teacherCount: number;
  lastActivityAt: string | null;
  goalRateAverage: number | null;
  goalUserCount: number;
}

export interface HqTenants {
  asOf: string;
  tenants: HqTenantRow[];
}

/** 기관 한 곳, 서비스 하나(목표관리 제외 5개)의 사용량. 한도는 학생 단위라 기관 전체 % 는 없다(Q6). */
export interface HqUsageRow {
  tenantId: string;
  programKey: string;
  /** 기관 설정 행이 있고 켜져 있다. */
  provided: boolean;
  /** 기관 설정 한도(학생별 조정 전). null 은 그 한도 없음. */
  monthLimit: number | null;
  termLimit: number | null;
  monthUsed: number;
  monthCappedStudents: number;
  termUsed: number;
  termCappedStudents: number;
  /** 이번 학기가 끝나는 날(다음 학기 첫날). 학기 개월 수가 없으면 null. */
  termResetsOn: string | null;
}

export interface HqUsage {
  asOf: string;
  usage: HqUsageRow[];
}

async function getJson<T>(path: string, includeInternal: boolean): Promise<T> {
  const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
  const response = await apiFetch(
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

// 로그인 지표(/api/admin/hq-dashboard/logins). search 는 filters.ts 의 statsSearch, logSearch 가 만든다.
export type LoginSource = "measured" | "estimated" | "none";

export interface LoginBucket {
  start: string;
  end: string;
  source: LoginSource;
  members: number;
  byMemberType: Record<string, number>;
}

export interface LoginStatsResponse {
  ok: true;
  from: string;
  to: string;
  grain: "day" | "week" | "month";
  mauMode: "calendar" | "rolling30";
  includeInternal: boolean;
  /** 가장 이른 로그인 기록 순간(ISO Z). 화면이 브라우저 시간대의 날짜로 바꿔 보인다. */
  firstMeasuredAt: string | null;
  series: LoginBucket[];
  dau: { from: string; to: string; average: number; source: LoginSource };
  mau: {
    from: string;
    to: string;
    mode: "calendar" | "rolling30";
    members: number;
    source: LoginSource;
    byMemberType: Record<string, number>;
  };
}

export interface LoginLogItem {
  profileId: string;
  /** 보는 사람 시간대의 날(YYYY-MM-DD). */
  loginDate: string;
  /** 그날 처음 기록된 순간(ISO Z). */
  firstSeenAt: string;
  name: string | null;
  memberType: string | null;
  tenantName: string | null;
}

export interface LoginLogResponse {
  ok: true;
  from: string;
  to: string;
  includeInternal: boolean;
  page: number;
  pageSize: number;
  total: number;
  namesVisible: boolean;
  items: LoginLogItem[];
}

async function getWithSearch<T>(path: string, search: string): Promise<T> {
  const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
  const response = await apiFetch(`${path}?${search}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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

const getLogins = <T>(search: string) =>
  getWithSearch<T>("/api/admin/hq-dashboard/logins", search);

export function fetchLoginStats(search: string) {
  return getLogins<LoginStatsResponse>(search);
}

export function fetchLoginLog(search: string) {
  return getLogins<LoginLogResponse>(search);
}

export function fetchHqUsage(includeInternal: boolean): Promise<HqUsage> {
  return getJson<HqUsage>("/api/admin/hq-dashboard/usage", includeInternal);
}

// 가입, 결제 추이(/api/admin/hq-dashboard/trends). search 는 filters.ts 의 trendSearch 가 만든다.
export interface HqTrendBucket {
  start: string;
  end: string;
  signups: number;
  signupsByMemberType: Record<string, number>;
  paidOrders: number;
}

export interface HqTrendsResponse {
  ok: true;
  from: string;
  to: string;
  grain: "day" | "week" | "month";
  mauMode: "calendar" | "rolling30";
  includeInternal: boolean;
  series: HqTrendBucket[];
}

export function fetchHqTrends(search: string) {
  return getWithSearch<HqTrendsResponse>(
    "/api/admin/hq-dashboard/trends",
    search,
  );
}

// 위닝 B2C 요약(/api/admin/hq-dashboard/b2c). search 는 filters.ts 의 b2cSearch 가 만든다.
export interface HqB2cResponse {
  ok: true;
  from: string;
  to: string;
  includeInternal: boolean;
  members: { total: number; byMemberType: Record<string, number> };
  payments: {
    payingMembers: number;
    orderCount: number;
    paidAmount: number;
    refundedAmount: number;
    netAmount: number;
  };
}

export function fetchHqB2c(search: string) {
  return getWithSearch<HqB2cResponse>("/api/admin/hq-dashboard/b2c", search);
}
