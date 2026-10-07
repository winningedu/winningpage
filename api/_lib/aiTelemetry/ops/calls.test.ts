import { describe, expect, it } from "vitest";
import { type CallRow, toCallListItem } from "./calls.js";

const row: CallRow = {
  id: "c1",
  created_at: "2026-10-01T01:00:02Z",
  started_at: "2026-10-01T01:00:00Z",
  trace_id: "t1",
  kind: "generate",
  service: "growth",
  feature: "report",
  step: "3",
  target_kind: "report",
  target_id: "r1",
  profile_id: "p1",
  model: "m-a",
  prompt_version: "v2",
  attempt: 2,
  retry_reason: "validation",
  transport_attempt: 1,
  status: "error",
  error_code: "E1",
  error_message: "boom",
  finish_reason: "STOP",
  prompt_tokens: 100,
  output_tokens: 20,
  cached_tokens: 10,
  thoughts_tokens: 5,
  total_tokens: 125,
  input_chars: 400,
  output_chars: 80,
  latency_ms: 2000,
  validation: "failed",
  issue_codes: ["A", "B"],
};

describe("toCallListItem", () => {
  it("snake_case 행을 camelCase 목록 항목으로 바꾼다", () => {
    expect(toCallListItem(row)).toEqual({
      id: "c1",
      createdAt: "2026-10-01T01:00:02Z",
      startedAt: "2026-10-01T01:00:00Z",
      traceId: "t1",
      kind: "generate",
      service: "growth",
      feature: "report",
      step: "3",
      targetKind: "report",
      targetId: "r1",
      profileId: "p1",
      model: "m-a",
      promptVersion: "v2",
      attempt: 2,
      retryReason: "validation",
      transportAttempt: 1,
      status: "error",
      errorCode: "E1",
      errorMessage: "boom",
      finishReason: "STOP",
      tokens: { prompt: 100, output: 20, cached: 10, thoughts: 5, total: 125 },
      inputChars: 400,
      outputChars: 80,
      latencyMs: 2000,
      validation: "failed",
      issueCodes: ["A", "B"],
    });
  });

  it("issue_codes 가 null 이면 빈 배열", () => {
    expect(toCallListItem({ ...row, issue_codes: null }).issueCodes).toEqual(
      [],
    );
  });
});
