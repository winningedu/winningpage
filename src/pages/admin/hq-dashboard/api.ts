// 본사 대시보드 서버 호출(api/admin/hq-dashboard/*). api 클라이언트가 인증과 X-Time-Zone 을 싣고, 실패는 ApiError 로 던져 useQuery 가 오류로 받는다.
// 응답은 스키마로 읽는다. 스키마와 어긋나면 클라이언트와 서버 계약이 다른 것이라 SchemaValidationError 가 난다.

import { z } from "zod";
import { api } from "@/lib/http/client";

const contractStatusSchema = z.enum([
  "trial",
  "none",
  "upcoming",
  "active",
  "ending_soon",
  "grace",
  "expired",
]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

const hqSummarySchema = z.object({
  asOf: z.string(),
  tenantCount: z.number(),
  studentCount: z.number(),
  studentWithoutEnrollmentCount: z.number(),
  teacherCount: z.number(),
  contracts: z.object({
    trial: z.number(),
    none: z.number(),
    upcoming: z.number(),
    active: z.number(),
    endingSoon: z.number(),
    grace: z.number(),
    expired: z.number(),
  }),
});
export type HqSummary = z.infer<typeof hqSummarySchema>;

const hqTenantRowSchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  region: z.string(),
  orgType: z.string(),
  contractStartDate: z.string().nullable(),
  contractEndDate: z.string().nullable(),
  graceEnd: z.string().nullable(),
  trialStartDate: z.string().nullable(),
  trialEndDate: z.string().nullable(),
  /** trial 은 시범기간 안이고 계약 기간(active, ending_soon) 밖인 기관(결정 117). */
  contractStatus: contractStatusSchema,
  studentCount: z.number(),
  /** 학적이 없는 학생 수. 화면은 "학년, 반 미상"으로 보인다. */
  studentWithoutEnrollmentCount: z.number(),
  teacherCount: z.number(),
  lastActivityAt: z.string().nullable(),
  goalRateAverage: z.number().nullable(),
  goalUserCount: z.number(),
});
export type HqTenantRow = z.infer<typeof hqTenantRowSchema>;

const hqTenantsSchema = z.object({
  asOf: z.string(),
  items: z.array(hqTenantRowSchema),
});
export type HqTenants = z.infer<typeof hqTenantsSchema>;

/** 기관 한 곳, 서비스 하나(목표관리 제외 5개)의 사용량. 한도는 학생 단위라 기관 전체 % 는 없다(Q6). */
const hqUsageRowSchema = z.object({
  tenantId: z.string(),
  programKey: z.string(),
  /** 기관 설정 행이 있고 켜져 있다. */
  provided: z.boolean(),
  /** 기관 설정 한도(학생별 조정 전). null 은 그 한도 없음. */
  monthLimit: z.number().nullable(),
  termLimit: z.number().nullable(),
  monthUsed: z.number(),
  monthCappedStudents: z.number(),
  termUsed: z.number(),
  termCappedStudents: z.number(),
  /** 이번 학기가 끝나는 날(다음 학기 첫날). 학기 개월 수가 없으면 null. */
  termResetsOn: z.string().nullable(),
});
export type HqUsageRow = z.infer<typeof hqUsageRowSchema>;

const hqUsageSchema = z.object({
  asOf: z.string(),
  items: z.array(hqUsageRowSchema),
});
export type HqUsage = z.infer<typeof hqUsageSchema>;

// includeInternal 만 받는 세 라우트는 1(포함), 0(제외)을 그대로 보낸다.
function internalParams(includeInternal: boolean) {
  return new URLSearchParams({ includeInternal: includeInternal ? "1" : "0" });
}

export function fetchHqSummary(
  includeInternal: boolean,
  signal?: AbortSignal,
): Promise<HqSummary> {
  return api
    .get("admin/hq-dashboard/summary", {
      searchParams: internalParams(includeInternal),
      signal,
    })
    .json(hqSummarySchema);
}

export function fetchHqTenants(
  includeInternal: boolean,
  signal?: AbortSignal,
): Promise<HqTenants> {
  return api
    .get("admin/hq-dashboard/tenants", {
      searchParams: internalParams(includeInternal),
      signal,
    })
    .json(hqTenantsSchema);
}

// 로그인 지표(/api/admin/hq-dashboard/logins). search 는 filters.ts 의 statsSearch, logSearch 가 만든다.
const loginSourceSchema = z.enum(["measured", "estimated", "none"]);
export type LoginSource = z.infer<typeof loginSourceSchema>;

const grainSchema = z.enum(["day", "week", "month"]);
const mauModeSchema = z.enum(["calendar", "rolling30"]);
const byMemberTypeSchema = z.record(z.string(), z.number());

const loginBucketSchema = z.object({
  start: z.string(),
  end: z.string(),
  source: loginSourceSchema,
  members: z.number(),
  byMemberType: byMemberTypeSchema,
});
export type LoginBucket = z.infer<typeof loginBucketSchema>;

const loginStatsSchema = z.object({
  from: z.string(),
  to: z.string(),
  grain: grainSchema,
  mauMode: mauModeSchema,
  includeInternal: z.boolean(),
  /** 가장 이른 로그인 기록 순간(ISO Z). 화면이 브라우저 시간대의 날짜로 바꿔 보인다. */
  firstMeasuredAt: z.string().nullable(),
  series: z.array(loginBucketSchema),
  dau: z.object({
    from: z.string(),
    to: z.string(),
    average: z.number(),
    source: loginSourceSchema,
  }),
  mau: z.object({
    from: z.string(),
    to: z.string(),
    mode: mauModeSchema,
    members: z.number(),
    source: loginSourceSchema,
    byMemberType: byMemberTypeSchema,
  }),
});
export type LoginStatsResponse = z.infer<typeof loginStatsSchema>;

const loginLogItemSchema = z.object({
  profileId: z.string(),
  /** 보는 사람 시간대의 날(YYYY-MM-DD). */
  loginDate: z.string(),
  /** 그날 처음 기록된 순간(ISO Z). */
  firstSeenAt: z.string(),
  name: z.string().nullable(),
  memberType: z.string().nullable(),
  tenantName: z.string().nullable(),
});
export type LoginLogItem = z.infer<typeof loginLogItemSchema>;

const loginLogSchema = z.object({
  from: z.string(),
  to: z.string(),
  includeInternal: z.boolean(),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  namesVisible: z.boolean(),
  items: z.array(loginLogItemSchema),
});
export type LoginLogResponse = z.infer<typeof loginLogSchema>;

export function fetchLoginStats(search: string, signal?: AbortSignal) {
  return api
    .get("admin/hq-dashboard/logins", {
      searchParams: new URLSearchParams(search),
      signal,
    })
    .json(loginStatsSchema);
}

export function fetchLoginLog(search: string, signal?: AbortSignal) {
  return api
    .get("admin/hq-dashboard/logins", {
      searchParams: new URLSearchParams(search),
      signal,
    })
    .json(loginLogSchema);
}

export function fetchHqUsage(
  includeInternal: boolean,
  signal?: AbortSignal,
): Promise<HqUsage> {
  return api
    .get("admin/hq-dashboard/usage", {
      searchParams: internalParams(includeInternal),
      signal,
    })
    .json(hqUsageSchema);
}

// 가입, 결제 추이(/api/admin/hq-dashboard/trends). search 는 filters.ts 의 trendSearch 가 만든다.
const hqTrendBucketSchema = z.object({
  start: z.string(),
  end: z.string(),
  signups: z.number(),
  signupsByMemberType: byMemberTypeSchema,
  paidOrders: z.number(),
});
export type HqTrendBucket = z.infer<typeof hqTrendBucketSchema>;

const hqTrendsSchema = z.object({
  from: z.string(),
  to: z.string(),
  grain: grainSchema,
  mauMode: mauModeSchema,
  includeInternal: z.boolean(),
  series: z.array(hqTrendBucketSchema),
});
export type HqTrendsResponse = z.infer<typeof hqTrendsSchema>;

export function fetchHqTrends(search: string, signal?: AbortSignal) {
  return api
    .get("admin/hq-dashboard/trends", {
      searchParams: new URLSearchParams(search),
      signal,
    })
    .json(hqTrendsSchema);
}

// 위닝 B2C 요약(/api/admin/hq-dashboard/b2c). search 는 filters.ts 의 b2cSearch 가 만든다.
const hqB2cSchema = z.object({
  from: z.string(),
  to: z.string(),
  includeInternal: z.boolean(),
  members: z.object({ total: z.number(), byMemberType: byMemberTypeSchema }),
  payments: z.object({
    payingMembers: z.number(),
    orderCount: z.number(),
    paidAmount: z.number(),
    refundedAmount: z.number(),
    netAmount: z.number(),
  }),
});
export type HqB2cResponse = z.infer<typeof hqB2cSchema>;

export function fetchHqB2c(search: string, signal?: AbortSignal) {
  return api
    .get("admin/hq-dashboard/b2c", {
      searchParams: new URLSearchParams(search),
      signal,
    })
    .json(hqB2cSchema);
}
