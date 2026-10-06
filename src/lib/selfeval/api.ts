// 자기평가서 API 클라이언트, /api/selfeval/* 엔드포인트의 호출 함수.
// 성장설계 api.ts 와 같은 규칙이다: 모든 함수는 예외를 던지지 않고 ApiResult 로 돌려준다.
//   { kind: "ok", data } | { kind: "error", status, code, message, extra? } | { kind: "timeout" }
// 서버에 닿지 못한 실패는 status 0(세션 없음은 401 UNAUTHENTICATED, 네트워크는 NETWORK)이다.
//
// 결과 해석(normalizeApiResult)은 성장설계의 것을 그대로 쓴다. 오류 본문 모양이 같다.
// 모델을 부르는 단계(analyze run, write generate, verify)는 `ai: true` 로 70초 타임아웃 경로를 쓴다.
//
// 타입은 types.ts 에 있고 이 파일이 다시 내보낸다. 화면은 이 파일 하나만 import 한다.

import { ApiFetchTimeoutError, apiFetch, getAuthHeader } from "../apiFetch";
import {
  type ApiResult,
  GENERIC_ERROR_MESSAGE,
  normalizeApiResult,
} from "../growth/apiResult";
import { AI_CALL_TIMEOUT_MS, fetchWithTimeout } from "../performance/apiClient";
import type {
  AnalysisField,
  AnalyzeEditResponse,
  AnalyzeRunResponse,
  ConflictChoice,
  EntryResponse,
  FinalizeResponse,
  ManualInput,
  PickListResponse,
  PickManualResponse,
  PickSelectResponse,
  PromotedRecord,
  SessionDetailResponse,
  SessionInput,
  SessionResponse,
  VerifyResponse,
  WriteEditResponse,
  WriteGenerateResponse,
} from "./types";

export type { ApiResult } from "../growth/apiResult";
export { normalizeApiResult } from "../growth/apiResult";
export type * from "./types";

const BASE = "/api/selfeval";

type RequestOptions = {
  method: "GET" | "POST";
  body?: unknown;
  /** true 면 모델 호출용 70초 타임아웃 경로를 쓴다. */
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

export async function request<T>(
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

// ── 진입과 조회 ───────────────────────────────────────────────────────
/** 시작 화면과 셸이 쓰는 진입 정보(이용권, 열린 세션, 성장설계 배너, 프로필). */
export function fetchEntry() {
  return request<EntryResponse>(`${BASE}/reports`, { method: "GET" });
}

export function fetchSessionDetail(sessionId: string) {
  const query = new URLSearchParams({ sessionId });
  return request<SessionDetailResponse>(`${BASE}/reports?${query.toString()}`, {
    method: "GET",
  });
}

// ── 세션 ──────────────────────────────────────────────────────────────
export function createSession(input: SessionInput) {
  return request<SessionResponse>(`${BASE}/session`, {
    method: "POST",
    body: { action: "create", ...input },
  });
}

export function updateSession(sessionId: string, patch: Partial<SessionInput>) {
  return request<SessionResponse>(`${BASE}/session`, {
    method: "POST",
    body: { action: "update", sessionId, ...patch },
  });
}

export function discardSession(sessionId: string) {
  return request<{ ok: true }>(`${BASE}/session`, {
    method: "POST",
    body: { action: "discard", sessionId },
  });
}

// ── 활동 선택 ─────────────────────────────────────────────────────────
export function pickList(sessionId: string) {
  return request<PickListResponse>(`${BASE}/pick-records`, {
    method: "POST",
    body: { sessionId, action: "list" },
  });
}

export function pickSelect(
  sessionId: string,
  coreId: string,
  supportIds: string[],
) {
  return request<PickSelectResponse>(`${BASE}/pick-records`, {
    method: "POST",
    body: { sessionId, action: "select", coreId, supportIds },
  });
}

export function pickManual(sessionId: string, input: ManualInput) {
  return request<PickManualResponse>(`${BASE}/pick-records`, {
    method: "POST",
    body: { sessionId, action: "manual", input },
  });
}

// ── 분석 ──────────────────────────────────────────────────────────────
/** 모델로 11항목을 분석한다. 직접 입력 활동은 모델 없이 바로 돌아온다. */
export function analyzeRun(sessionId: string) {
  return request<AnalyzeRunResponse>(`${BASE}/analyze`, {
    method: "POST",
    body: { sessionId, action: "run" },
    ai: true,
  });
}

export function analyzeSave(
  sessionId: string,
  edits: Partial<Record<AnalysisField, string>>,
) {
  return request<AnalyzeEditResponse>(`${BASE}/analyze`, {
    method: "POST",
    body: { sessionId, action: "save", edits },
  });
}

export function analyzeResolveConflict(
  sessionId: string,
  index: number,
  choice: ConflictChoice,
) {
  return request<AnalyzeEditResponse>(`${BASE}/analyze`, {
    method: "POST",
    body: { sessionId, action: "resolve-conflict", index, choice },
  });
}

// ── 생성 ──────────────────────────────────────────────────────────────
export function writeGenerate(sessionId: string) {
  return request<WriteGenerateResponse>(`${BASE}/write`, {
    method: "POST",
    body: { sessionId, action: "generate" },
    ai: true,
  });
}

export function writeEdit(sessionId: string, paragraphs: string[]) {
  return request<WriteEditResponse>(`${BASE}/write`, {
    method: "POST",
    body: { sessionId, action: "edit", paragraphs },
  });
}

export function writeConfirmFeeling(sessionId: string, sentenceId: string) {
  return request<WriteEditResponse>(`${BASE}/write`, {
    method: "POST",
    body: { sessionId, action: "confirm-feeling", sentenceId },
  });
}

// ── 검증과 최종 저장 ──────────────────────────────────────────────────
export function verifySession(sessionId: string) {
  return request<VerifyResponse>(`${BASE}/verify`, {
    method: "POST",
    body: { sessionId },
    ai: true,
  });
}

export function finalizeSession(
  sessionId: string,
  promoted: PromotedRecord,
  fulfillsPlanItem?: boolean,
) {
  return request<FinalizeResponse>(`${BASE}/finalize`, {
    method: "POST",
    body: {
      sessionId,
      promoted,
      ...(fulfillsPlanItem === undefined ? {} : { fulfillsPlanItem }),
    },
  });
}
