// 본사 대시보드 API 계약. 서버(api/_routes/admin/hq-dashboard.ts)가 요청 스키마로 검증하고, 브라우저(src/pages/admin/hq-dashboard/api.ts)가 응답 스키마로 검증한다.
// 날짜(from, to)는 보는 사람 시간대의 달력 날짜(YYYY-MM-DD)다. 날짜 형식과 기간 검사는 서버 parsePeriod 가 하고 문구가 화면에 그대로 보인다.

import { z } from "zod";

/** 로그인 기록 표 한 쪽의 줄 수. */
export const HQ_LOGIN_LOG_PAGE_SIZE = 50;

export const GRAINS = ["day", "week", "month"] as const;
export const MAU_MODES = ["calendar", "rolling30"] as const;
export const LOGIN_SCOPES = ["all", "b2c"] as const;
export const LOGIN_VIEWS = ["stats", "log"] as const;

export type Grain = (typeof GRAINS)[number];
export type MauMode = (typeof MAU_MODES)[number];

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 기관 현황 쿼리. includeInternal 은 "1"(포함) 또는 "0", 없으면 기본 제외. 그 밖의 값은 400. */
export const includeInternalQuery = z.object({
  includeInternal: z
    .enum(["0", "1"])
    .optional()
    .transform((value) => value === "1"),
});

// 기간 통계 라우트 공통 쿼리. includeInternal 은 "1" 일 때만 포함이고 다른 값은 제외다.
export const periodQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  includeInternal: z
    .string()
    .optional()
    .transform((value) => value === "1"),
});

export const statsQuery = periodQuery.extend({
  grain: z.enum(GRAINS).default("day"),
  mau: z.enum(MAU_MODES).default("calendar"),
});

export const loginsQuery = statsQuery.extend({
  view: z.enum(LOGIN_VIEWS).default("stats"),
  scope: z.enum(LOGIN_SCOPES).default("all"),
  page: z.string().transform(Number).pipe(z.number().int().min(1)).default(1),
});

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

export const contractStatusSchema = z.enum([
  "trial",
  "none",
  "upcoming",
  "active",
  "ending_soon",
  "grace",
  "expired",
]);
export type ContractStatus = z.output<typeof contractStatusSchema>;

export const hqSummarySchema = z.object({
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
export type HqSummary = z.output<typeof hqSummarySchema>;

export const hqTenantRowSchema = z.object({
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
export type HqTenantRow = z.output<typeof hqTenantRowSchema>;

export const hqTenantsSchema = z.object({
  asOf: z.string(),
  items: z.array(hqTenantRowSchema),
});
export type HqTenants = z.output<typeof hqTenantsSchema>;

/** 기관 한 곳, 서비스 하나(목표관리 제외 5개)의 사용량. 한도는 학생 단위라 기관 전체 % 는 없다(Q6). */
export const hqUsageRowSchema = z.object({
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
export type HqUsageRow = z.output<typeof hqUsageRowSchema>;

export const hqUsageSchema = z.object({
  asOf: z.string(),
  items: z.array(hqUsageRowSchema),
});
export type HqUsage = z.output<typeof hqUsageSchema>;

export const loginSourceSchema = z.enum(["measured", "estimated", "none"]);
export type LoginSource = z.output<typeof loginSourceSchema>;

export const grainSchema = z.enum(GRAINS);
export const mauModeSchema = z.enum(MAU_MODES);
export const byMemberTypeSchema = z.record(z.string(), z.number());

export const loginBucketSchema = z.object({
  start: z.string(),
  end: z.string(),
  source: loginSourceSchema,
  members: z.number(),
  byMemberType: byMemberTypeSchema,
});
export type LoginBucket = z.output<typeof loginBucketSchema>;

export const loginStatsSchema = z.object({
  from: z.string(),
  to: z.string(),
  grain: grainSchema,
  mauMode: mauModeSchema,
  scope: z.enum(LOGIN_SCOPES),
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
export type LoginStatsResponse = z.output<typeof loginStatsSchema>;

export const loginLogItemSchema = z.object({
  profileId: z.string(),
  /** 보는 사람 시간대의 날(YYYY-MM-DD). */
  loginDate: z.string(),
  /** 그날 처음 기록된 순간(ISO Z). */
  firstSeenAt: z.string(),
  name: z.string().nullable(),
  memberType: z.string().nullable(),
  tenantName: z.string().nullable(),
});
export type LoginLogItem = z.output<typeof loginLogItemSchema>;

export const loginLogSchema = z.object({
  from: z.string(),
  to: z.string(),
  includeInternal: z.boolean(),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  namesVisible: z.boolean(),
  items: z.array(loginLogItemSchema),
});
export type LoginLogResponse = z.output<typeof loginLogSchema>;

export const hqTrendBucketSchema = z.object({
  start: z.string(),
  end: z.string(),
  signups: z.number(),
  signupsByMemberType: byMemberTypeSchema,
  paidOrders: z.number(),
});
export type HqTrendBucket = z.output<typeof hqTrendBucketSchema>;

export const hqTrendsSchema = z.object({
  from: z.string(),
  to: z.string(),
  grain: grainSchema,
  mauMode: mauModeSchema,
  includeInternal: z.boolean(),
  series: z.array(hqTrendBucketSchema),
});
export type HqTrendsResponse = z.output<typeof hqTrendsSchema>;

export const hqB2cSchema = z.object({
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
export type HqB2cResponse = z.output<typeof hqB2cSchema>;
