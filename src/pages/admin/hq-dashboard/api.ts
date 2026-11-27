// 본사 대시보드 서버 호출(api/admin/hq-dashboard/*). api 클라이언트가 인증과 X-Time-Zone 을 싣고, 실패는 ApiError 로 던져 useQuery 가 오류로 받는다.
// 응답 스키마와 타입은 서버와 같은 계약(shared/hq-dashboard/contract.ts)을 쓴다. 스키마와 어긋나면 클라이언트와 서버 계약이 다른 것이라 SchemaValidationError 가 난다.

import { api } from "@/lib/http/client";
import {
  hqB2cSchema,
  hqSummarySchema,
  hqTenantsSchema,
  hqTrendsSchema,
  hqUsageSchema,
  loginLogSchema,
  loginStatsSchema,
} from "../../../../shared/hq-dashboard/contract.js";

export type {
  ContractStatus,
  HqB2cResponse,
  HqSummary,
  HqTenantRow,
  HqTenants,
  HqTrendBucket,
  HqTrendsResponse,
  HqUsage,
  HqUsageRow,
  LoginBucket,
  LoginLogItem,
  LoginLogResponse,
  LoginSource,
  LoginStatsResponse,
} from "../../../../shared/hq-dashboard/contract.js";

import type {
  HqSummary,
  HqTenants,
  HqUsage,
} from "../../../../shared/hq-dashboard/contract.js";

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
export function fetchHqTrends(search: string, signal?: AbortSignal) {
  return api
    .get("admin/hq-dashboard/trends", {
      searchParams: new URLSearchParams(search),
      signal,
    })
    .json(hqTrendsSchema);
}

// 위닝 B2C 요약(/api/admin/hq-dashboard/b2c). search 는 filters.ts 의 b2cSearch 가 만든다.
export function fetchHqB2c(search: string, signal?: AbortSignal) {
  return api
    .get("admin/hq-dashboard/b2c", {
      searchParams: new URLSearchParams(search),
      signal,
    })
    .json(hqB2cSchema);
}
