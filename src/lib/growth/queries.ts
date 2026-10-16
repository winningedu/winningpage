// 성장설계 TanStack Query 팩토리. queryClient.ts 의 관례를 따른다.
//   - queryKey 에 userId 를 반드시 넣는다(계정 전환 시 캐시 오염 방지).
//   - enabled: !!userId 를 팩토리에 둔다(게스트 상태에서 소비처가 실수로 조회하지 않게).
//   - 실패(error, timeout)는 성공 데이터로 캐싱하지 않고 GrowthApiError 로 던진다.
//     소비처는 query.error.result 로 code, status, extra 를 읽어 분기한다.
import { queryOptions } from "@tanstack/react-query";
import {
  type ApiResult,
  fetchPlan,
  fetchReports,
  fetchSurveyBootstrap,
} from "./api";

/** queryFn 이 던지는 에러. 원본 ApiResult(error 또는 timeout)를 그대로 들고 있다. */
export class GrowthApiError extends Error {
  readonly result: Exclude<ApiResult<unknown>, { kind: "ok" }>;

  constructor(result: Exclude<ApiResult<unknown>, { kind: "ok" }>) {
    super(
      result.kind === "error" ? `growth-api-${result.code}` : "growth-timeout",
    );
    this.name = "GrowthApiError";
    this.result = result;
  }
}

function unwrap<T>(result: ApiResult<T>): T {
  if (result.kind === "ok") return result.data;
  throw new GrowthApiError(result);
}

export const growthQueryKeys = {
  root: ["growth"] as const,
  surveyBootstrap: (userId: string | null) =>
    ["growth", "survey-bootstrap", userId] as const,
  reports: (userId: string | null) => ["growth", "reports", userId] as const,
  profileName: (userId: string | null) =>
    ["growth", "profile-name", userId] as const,
  plan: (userId: string | null, reportId?: string) =>
    ["growth", "plan", userId, reportId ?? null] as const,
};

// 설문 저장, 회차 생성 직후 갱신이 잦은 데이터라 짧게 둔다. 시작 화면과 사이드바가
// 같은 캐시를 구독하므로 화면 이동마다 재조회하지 않을 만큼만 신선하게 둔다.
const GROWTH_STALE_MS = 15_000;

export function growthSurveyBootstrapQuery(userId: string | null) {
  return queryOptions({
    queryKey: growthQueryKeys.surveyBootstrap(userId),
    queryFn: async () => unwrap(await fetchSurveyBootstrap()),
    staleTime: GROWTH_STALE_MS,
    enabled: !!userId,
    retry: 0,
  });
}

export function growthReportsQuery(userId: string | null) {
  return queryOptions({
    queryKey: growthQueryKeys.reports(userId),
    queryFn: async () => unwrap(await fetchReports()),
    staleTime: GROWTH_STALE_MS,
    enabled: !!userId,
    retry: 0,
  });
}

/** reportId 를 생략하면 서버가 가장 최근 완료 회차를 쓴다. */
export function growthPlanQuery(userId: string | null, reportId?: string) {
  return queryOptions({
    queryKey: growthQueryKeys.plan(userId, reportId),
    queryFn: async () => unwrap(await fetchPlan(reportId)),
    staleTime: GROWTH_STALE_MS,
    enabled: !!userId,
    retry: 0,
  });
}
