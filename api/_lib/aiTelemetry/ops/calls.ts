// 관리자 AI 호출 목록(view=calls)의 행 변환. 조회와 필터 체인은 핸들러가 한다.

import type { Database } from "../../../../src/types/database.types.js";

export type CallRow = Database["public"]["Tables"]["ai_model_calls"]["Row"];

export type CallListItem = {
  id: string;
  createdAt: string;
  startedAt: string;
  traceId: string;
  kind: string;
  service: string;
  feature: string;
  step: string | null;
  /** 한 단계 안 병렬 호출 구분 키. 병렬 호출이 없는 서비스와 이전 행은 null. */
  callKey: string | null;
  targetKind: string | null;
  targetId: string | null;
  profileId: string | null;
  model: string;
  promptVersion: string | null;
  attempt: number;
  retryReason: string | null;
  transportAttempt: number;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  finishReason: string | null;
  tokens: {
    prompt: number | null;
    output: number | null;
    cached: number | null;
    thoughts: number | null;
    total: number | null;
  };
  inputChars: number | null;
  outputChars: number | null;
  latencyMs: number;
  validation: string | null;
  issueCodes: string[];
};

export function toCallListItem(row: CallRow): CallListItem {
  return {
    id: row.id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    traceId: row.trace_id,
    kind: row.kind,
    service: row.service,
    feature: row.feature,
    step: row.step,
    // 컬럼 추가 전 스키마로 읽은 행에는 call_key 가 없다.
    callKey: row.call_key ?? null,
    targetKind: row.target_kind,
    targetId: row.target_id,
    profileId: row.profile_id,
    model: row.model,
    promptVersion: row.prompt_version,
    attempt: row.attempt,
    retryReason: row.retry_reason,
    transportAttempt: row.transport_attempt,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    finishReason: row.finish_reason,
    tokens: {
      prompt: row.prompt_tokens,
      output: row.output_tokens,
      cached: row.cached_tokens,
      thoughts: row.thoughts_tokens,
      total: row.total_tokens,
    },
    inputChars: row.input_chars,
    outputChars: row.output_chars,
    latencyMs: row.latency_ms,
    validation: row.validation,
    issueCodes: row.issue_codes ?? [],
  };
}
