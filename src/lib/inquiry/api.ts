// 심화탐구 API 클라이언트, /api/inquiry/* 엔드포인트의 호출 함수(계약: docs/deep-inquiry-dev-plan.md 부록 A, B).
//
// 모든 함수는 예외를 던지지 않는다. 실패도 ApiResult(apiResult.ts)로 돌려준다.
//   { kind: "ok", data } | { kind: "error", status, code, message, extra? } | { kind: "timeout" }
// 서버에 닿지 못한 실패는 status 0(세션 없음은 401 UNAUTHENTICATED, 네트워크는 NETWORK)이다.
//
// 타임아웃: AI 를 부르는 생성 3개(recommendTopics, createPlanReport, evaluateReport)는
// 서버 maxDuration 60초보다 넉넉한 70초(performance/apiClient.ts 의 fetchWithTimeout)를 쓴다.
// 나머지는 apiFetch 기본 15초다. 인증 헤더는 getAuthHeader 가 만든다.
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
  AssetsRequest,
  AssetsResponse,
  EvaluateRequest,
  EvaluateResponse,
  FinalizeRequest,
  FinalizeResponse,
  PlanReportRequest,
  PlanReportResponse,
  RecommendRequest,
  RecommendResponse,
  ReportsList,
  SessionDetail,
  SessionRequest,
  SessionResponse,
  SubmissionRequest,
  SubmissionResponse,
} from "./types";

export type { ApiResult } from "./apiResult";
export { normalizeApiResult } from "./apiResult";
export type * from "./types";

const BASE = "/api/inquiry";

type RequestOptions = {
  method: "GET" | "POST";
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

// ── 세션, 자산, 작성본 ────────────────────────────────────────────────
/** 화면 1 부트스트랩. resume 은 열린 세션 조회, create 는 정보 입력 제출. */
export function postSession(req: SessionRequest) {
  return request<SessionResponse>(`${BASE}/session`, {
    method: "POST",
    body: req,
  });
}

/** 세션의 선택 자산 집합을 통째로 교체한다. */
export function postAssets(req: AssetsRequest) {
  return request<AssetsResponse>(`${BASE}/assets`, {
    method: "POST",
    body: req,
  });
}

/** draft 작성본 저장(60초 자동 저장과 수동 저장 공용). */
export function postSubmission(req: SubmissionRequest) {
  return request<SubmissionResponse>(`${BASE}/submission`, {
    method: "POST",
    body: req,
  });
}

// ── 조회 ──────────────────────────────────────────────────────────────
export function fetchReports() {
  return request<ReportsList>(`${BASE}/reports`, { method: "GET" });
}

export function fetchSessionDetail(sessionId: string) {
  const query = new URLSearchParams({ sessionId });
  return request<SessionDetail>(`${BASE}/reports?${query.toString()}`, {
    method: "GET",
  });
}

// ── 생성(P4) ──────────────────────────────────────────────────────────
// 생성 3개는 ai 가 true 일 때 70초 타임아웃 경로를 탄다. 생성 실패 extra 는 GenerationFailureExtra.

/** 주제 3개 추천. 라운드 상한은 서버가 막는다(409 ROUND_LIMIT). */
export function recommendTopics(req: RecommendRequest, ai = true) {
  return request<RecommendResponse>(`${BASE}/recommend-topics`, {
    method: "POST",
    body: req,
    ai,
  });
}

/** 주제 확정과 설계 리포트 생성. 같은 주제로 다시 부르면 저장분을 돌려준다(result "done"). */
export function createPlanReport(req: PlanReportRequest, ai = true) {
  return request<PlanReportResponse>(`${BASE}/plan-report`, {
    method: "POST",
    body: req,
    ai,
  });
}

/** draft 작성본을 확정하고 평가 리포트를 만든다. */
export function evaluateReport(req: EvaluateRequest, ai = true) {
  return request<EvaluateResponse>(`${BASE}/evaluate-report`, {
    method: "POST",
    body: req,
    ai,
  });
}

/** 7항목 확정과 활동 기록 적립. 모델 호출이 없어 기본 타임아웃이다. */
export function finalizeSession(req: FinalizeRequest) {
  return request<FinalizeResponse>(`${BASE}/finalize`, {
    method: "POST",
    body: req,
  });
}
