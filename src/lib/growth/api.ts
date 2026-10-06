// 성장설계 API 클라이언트, /api/growth/* 6개 엔드포인트의 호출 함수.
//
// 모든 함수는 예외를 던지지 않는다. 실패도 ApiResult(apiResult.ts)로 돌려준다.
//   { kind: "ok", data } | { kind: "error", status, code, message, extra? } | { kind: "timeout" }
// 서버에 닿지 못한 실패는 status 0(세션 없음은 401 UNAUTHENTICATED, 네트워크는 NETWORK)이다.
//
// 타임아웃: AI 를 부르는 두 호출(runReportStep, collectExtract)은 서버 maxDuration 60초보다
// 넉넉한 70초(performance/apiClient.ts 의 fetchWithTimeout), 나머지는 apiFetch 기본 15초다.
// 인증 헤더는 getAuthHeader 가 만든다(타임아웃 예산에 포함되지 않는다, apiFetch.ts 주석 참고).
//
// 타입은 types.ts 에 있고 이 파일이 다시 내보낸다. 화면은 이 파일 하나만 import 한다.

import { ApiFetchTimeoutError, apiFetch, getAuthHeader } from "../apiFetch";
import { AI_CALL_TIMEOUT_MS, fetchWithTimeout } from "../performance/apiClient";
import {
  type ApiResult,
  GENERIC_ERROR_MESSAGE,
  normalizeApiResult,
} from "./apiResult";
import type {
  CollectAggregateRequest,
  CollectCommitResponse,
  CollectSummaryResponse,
  ExtractResult,
  PlanItemAction,
  PlanItemChangeResponse,
  PlanResponse,
  ReportDetail,
  ReportDetailView,
  ReportStepRequest,
  ReportStepResponse,
  ReportsList,
  SaveSurveyRequest,
  SaveSurveyResponse,
  SurveyBootstrap,
  UploadRequest,
  UploadUrlResult,
} from "./types";

export type { ApiResult } from "./apiResult";
export { normalizeApiResult } from "./apiResult";
export type * from "./types";

const BASE = "/api/growth";

type RequestOptions = {
  method: "GET" | "POST" | "PATCH";
  body?: unknown;
  /** true 면 AI 호출용 70초 타임아웃 경로를 쓴다. */
  ai?: boolean;
};

function isTimeout(error: unknown): boolean {
  if (error instanceof ApiFetchTimeoutError) return true;
  // fetchWithTimeout 은 타임아웃을 code "TIMEOUT" 인 일반 Error 로 바꿔 던진다.
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "TIMEOUT"
  );
}

async function request<T>(
  path: string,
  { method, body, ai = false }: RequestOptions,
): Promise<ApiResult<T>> {
  const authHeader = await getAuthHeader();
  if (!authHeader) {
    return {
      kind: "error",
      status: 401,
      code: "UNAUTHENTICATED",
      message: "로그인이 필요해요.",
    };
  }

  const init: RequestInit = {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...authHeader,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };

  let response: Response;
  try {
    response = ai
      ? await fetchWithTimeout(path, init, AI_CALL_TIMEOUT_MS)
      : await apiFetch(path, init);
  } catch (error) {
    if (isTimeout(error)) return { kind: "timeout" };
    return {
      kind: "error",
      status: 0,
      code: "NETWORK",
      message: GENERIC_ERROR_MESSAGE,
    };
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return normalizeApiResult<T>(response.status, json);
}

// ── 설문 ──────────────────────────────────────────────────────────────
export function fetchSurveyBootstrap() {
  return request<SurveyBootstrap>(`${BASE}/survey`, { method: "GET" });
}

export function saveSurvey({ reportId, answers }: SaveSurveyRequest) {
  return request<SaveSurveyResponse>(`${BASE}/survey`, {
    method: "POST",
    body: reportId === undefined ? { answers } : { reportId, answers },
  });
}

// ── 자료 수집 ─────────────────────────────────────────────────────────
export function collectSummary(body: CollectAggregateRequest) {
  return request<CollectSummaryResponse>(`${BASE}/collect`, {
    method: "POST",
    body: { action: "summary", ...body },
  });
}

export function collectCommit(body: CollectAggregateRequest) {
  return request<CollectCommitResponse>(`${BASE}/collect`, {
    method: "POST",
    body: { action: "commit", ...body },
  });
}

export function collectUploadUrl(upload: UploadRequest) {
  return request<UploadUrlResult>(`${BASE}/collect`, {
    method: "POST",
    body: { action: "upload-url", upload },
  });
}

/** AI 추출. 70초 타임아웃. 추출 실패(status failed)도 HTTP 200 이라 ok 로 온다. */
export function collectExtract(uploadId: string) {
  return request<ExtractResult>(`${BASE}/collect`, {
    method: "POST",
    body: { action: "extract", uploadId },
    ai: true,
  });
}

// ── 리포트 생성 ───────────────────────────────────────────────────────
/** 한 번에 한 단계(1~8)를 실행한다. 70초 타임아웃. 응답의 nextStep 으로 이어서 부른다. */
export function runReportStep({ reportId, step }: ReportStepRequest) {
  return request<ReportStepResponse>(`${BASE}/report`, {
    method: "POST",
    body: { reportId, step },
    ai: true,
  });
}

// ── 저장 리포트 ───────────────────────────────────────────────────────
export function fetchReports() {
  return request<ReportsList>(`${BASE}/reports`, { method: "GET" });
}

export function fetchReportDetail(reportId: string, view?: ReportDetailView) {
  const query = new URLSearchParams({ reportId });
  if (view) query.set("view", view);
  return request<ReportDetail>(`${BASE}/reports?${query.toString()}`, {
    method: "GET",
  });
}

// ── 실행계획 ──────────────────────────────────────────────────────────
/** reportId 를 생략하면 서버가 가장 최근 완료 회차를 쓴다. */
export function fetchPlan(reportId?: string) {
  const query = reportId
    ? `?${new URLSearchParams({ reportId }).toString()}`
    : "";
  return request<PlanResponse>(`${BASE}/plan${query}`, { method: "GET" });
}

export function patchPlanItem(action: PlanItemAction) {
  return request<PlanItemChangeResponse>(`${BASE}/plan/item`, {
    method: "PATCH",
    body: action,
  });
}
