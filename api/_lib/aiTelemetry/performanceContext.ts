// 수행평가 라우트용 계기판 컨텍스트 조립 헬퍼. 순수 함수만 둔다.

import type { AiTraceContext } from "./trace.js";

export type PerformanceFeature =
  | "recommend_topics"
  | "design_report"
  | "evaluate"
  | "analyze_guide"
  | "embed_one"
  | "embed_backfill"
  | "knowledge_dedupe"
  | "knowledge_search_preview"
  | "session_vectors";

export function performanceTraceContext(input: {
  feature: PerformanceFeature;
  sessionId?: string | null;
  profileId?: string | null;
  step?: string | null;
  promptVersion?: string | null;
  targetKind?: string | null;
  targetId?: string | null;
}): AiTraceContext {
  return {
    service: "performance",
    feature: input.feature,
    step: input.step ?? null,
    targetKind:
      input.targetKind ?? (input.sessionId ? "performance_session" : null),
    targetId: input.targetId ?? input.sessionId ?? null,
    profileId: input.profileId ?? null,
    promptVersion: input.promptVersion ?? null,
  };
}

// 구조 재시도 루프에서 이번 시도가 재시도면 직전 실패 사유를 기록 사유로 쓴다.
export function retryReasonOf(
  isRetry: boolean,
  lastFailure: string,
): string | null {
  return isRetry ? lastFailure : null;
}

// 모델 응답 검증 결과를 기록 주석 형식으로 바꾼다.
export function validationOf(
  ok: boolean,
  lastFailure: string,
): { validation: "ok" | "failed"; issueCodes?: string[] } {
  return ok
    ? { validation: "ok" }
    : { validation: "failed", issueCodes: [lastFailure] };
}
