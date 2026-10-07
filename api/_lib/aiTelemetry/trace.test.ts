import { describe, expect, it, vi } from "vitest";
import { createAiTrace } from "./trace.js";

const CTX = {
  service: "growth" as const,
  feature: "design_report",
  step: "3",
  profileId: "p-1",
  promptVersion: "v1",
};

const OK_CALL = {
  kind: "generate" as const,
  model: "gemini-2.5-flash",
  startedAt: 1_700_000_000_000,
  latencyMs: 120,
  transportAttempt: 1,
  status: "ok" as const,
};

describe("createAiTrace attempt", () => {
  it("beginAttempt 를 부를 때마다 attempt 가 1씩 오르고 사유를 저장한다", () => {
    const trace = createAiTrace(CTX);
    expect(trace.attempt).toBe(0);
    trace.beginAttempt(null);
    expect(trace.attempt).toBe(1);
    trace.beginAttempt("validation_failed");
    expect(trace.attempt).toBe(2);
    trace.recordCall(OK_CALL);
    expect(trace.calls[0]?.attempt).toBe(2);
    expect(trace.calls[0]?.retry_reason).toBe("validation_failed");
  });

  it("beginAttempt 없이 recordCall 하면 attempt 1 로 자동 기록한다", () => {
    const trace = createAiTrace(CTX);
    trace.recordCall(OK_CALL);
    expect(trace.attempt).toBe(1);
    expect(trace.calls[0]?.attempt).toBe(1);
    expect(trace.calls[0]?.retry_reason).toBeNull();
  });
});

describe("recordCall 행 변환", () => {
  it("ctx 를 행에 복사하고 시각과 토큰을 변환한다", () => {
    const trace = createAiTrace(CTX, { randomUUID: () => "trace-fixed" });
    trace.recordCall({
      ...OK_CALL,
      finishReason: "STOP",
      usage: { promptTokens: 10, outputTokens: 5 },
      inputChars: 40,
      outputChars: 20,
    });
    expect(trace.calls[0]).toMatchObject({
      trace_id: "trace-fixed",
      service: "growth",
      feature: "design_report",
      step: "3",
      profile_id: "p-1",
      prompt_version: "v1",
      kind: "generate",
      model: "gemini-2.5-flash",
      started_at: new Date(1_700_000_000_000).toISOString(),
      latency_ms: 120,
      transport_attempt: 1,
      status: "ok",
      finish_reason: "STOP",
      prompt_tokens: 10,
      output_tokens: 5,
      cached_tokens: null,
      thoughts_tokens: null,
      total_tokens: null,
      input_chars: 40,
      output_chars: 20,
    });
  });

  it("error_message 를 300자로 자른다", () => {
    const trace = createAiTrace(CTX);
    trace.recordCall({
      ...OK_CALL,
      status: "error",
      errorCode: "503",
      errorMessage: "x".repeat(500),
    });
    expect(trace.calls[0]?.error_message).toHaveLength(300);
    expect(trace.calls[0]?.error_code).toBe("503");
  });

  it("uuid 가 아닌 targetId 는 target_id null 로 두고 target_kind 는 유지한다", () => {
    const bad = createAiTrace({
      ...CTX,
      targetKind: "session",
      targetId: "abc",
    });
    bad.recordCall(OK_CALL);
    expect(bad.calls[0]?.target_id).toBeNull();
    expect(bad.calls[0]?.target_kind).toBe("session");

    const id = "123e4567-e89b-12d3-a456-426614174000";
    const good = createAiTrace({ ...CTX, targetKind: "session", targetId: id });
    good.recordCall(OK_CALL);
    expect(good.calls[0]?.target_id).toBe(id);
  });
});

describe("annotateLastCall", () => {
  it("마지막 generate 행에 검증 결과를 기록하고 행이 없으면 무시한다", () => {
    const trace = createAiTrace(CTX);
    trace.annotateLastCall({ validation: "ok" });
    trace.recordCall({ ...OK_CALL, kind: "embed" });
    trace.recordCall(OK_CALL);
    trace.recordCall({ ...OK_CALL, kind: "embed" });
    trace.annotateLastCall({ validation: "failed", issueCodes: ["a", "b"] });
    expect(trace.calls[1]?.validation).toBe("failed");
    expect(trace.calls[1]?.issue_codes).toEqual(["a", "b"]);
    expect(trace.calls[0]?.validation).toBeNull();
    expect(trace.calls[2]?.validation).toBeNull();
  });
});

const SEARCH = {
  kind: "knowledge" as const,
  degraded: false,
  startedAt: 1_700_000_000_000,
  latencyMs: 30,
  status: "ok" as const,
  hitResourceIds: ["r1", "r2"],
};

describe("recordCitations", () => {
  it("마지막 knowledge 검색 행에 중복 없이 저장하고 없으면 무시한다", () => {
    const trace = createAiTrace(CTX);
    trace.recordCitations(["r1"]);
    trace.recordSearch(SEARCH);
    trace.recordSearch({ ...SEARCH, kind: "student_history" });
    trace.recordCitations(["r1", "r1", "r2"]);
    expect(trace.searches[0]?.cited_resource_ids).toEqual(["r1", "r2"]);
    expect(trace.searches[1]?.cited_resource_ids).toBeNull();
  });
});

function mockDb(
  insertImpl: () => unknown = () => Promise.resolve({ error: null }),
) {
  const insert = vi.fn(insertImpl);
  const from = vi.fn(() => ({ insert }));
  return { db: { from } as never, from, insert };
}

describe("flush", () => {
  it("두 테이블에 각각 1회 insert 하고 두 번째 flush 는 아무것도 하지 않는다", async () => {
    const trace = createAiTrace(CTX);
    trace.recordCall(OK_CALL);
    trace.recordCall(OK_CALL);
    trace.recordSearch(SEARCH);
    const { db, from, insert } = mockDb();
    const first = await trace.flush(db);
    expect(first).toEqual({ ok: true, calls: 2, searches: 1 });
    expect(from).toHaveBeenCalledWith("ai_model_calls");
    expect(from).toHaveBeenCalledWith("ai_retrieval_events");
    expect(insert).toHaveBeenCalledTimes(2);
    await trace.flush(db);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("행이 없는 테이블은 건너뛴다", async () => {
    const trace = createAiTrace(CTX);
    trace.recordCall(OK_CALL);
    const { db, from } = mockDb();
    await trace.flush(db);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("ai_model_calls");
  });

  it("insert 가 reject 하거나 error 를 돌려줘도 throw 하지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const trace = createAiTrace(CTX);
    trace.recordCall(OK_CALL);
    const { db } = mockDb(() => Promise.reject(new Error("boom")));
    await expect(trace.flush(db)).resolves.toMatchObject({ ok: false });
    expect(warn).toHaveBeenCalled();

    const t2 = createAiTrace(CTX);
    t2.recordCall(OK_CALL);
    const m2 = mockDb(() => Promise.resolve({ error: { message: "rls" } }));
    await expect(t2.flush(m2.db)).resolves.toMatchObject({ ok: false });
    warn.mockRestore();
  });

  it("끝나지 않는 insert 는 timeoutMs 뒤 ok false 로 돌려준다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const trace = createAiTrace(CTX);
    trace.recordCall(OK_CALL);
    const { db } = mockDb(() => new Promise(() => {}));
    const result = await trace.flush(db, { timeoutMs: 10 });
    expect(result.ok).toBe(false);
    warn.mockRestore();
  });
});
