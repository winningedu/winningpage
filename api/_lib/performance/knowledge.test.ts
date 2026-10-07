import { beforeEach, describe, expect, it, vi } from "vitest";

const embedText = vi.fn();

vi.mock("./embeddings.js", () => ({
  embedText: (...args: unknown[]) => embedText(...args),
}));
vi.mock("../supabaseAdmin.js", () => ({
  createSupabaseAdmin: vi.fn(),
}));

import { createAiTrace } from "../aiTelemetry/trace.js";
import {
  loadDynamicAssessmentKnowledge,
  loadRelevantStudentSessions,
  RESOURCE_MATCH_THRESHOLD,
  TOPIC_MATCH_THRESHOLD,
} from "./knowledge.js";

const CTX = { service: "performance" as const, feature: "recommend_topics" };

const ROWS = [
  { id: "k1", title: "주제 하나", content: "내용 하나", similarity: 0.81 },
  { id: "k2", title: "주제 둘", content: "내용 둘", similarity: 0.7 },
];

type MockOptions = {
  rpc?: () => unknown;
  keywordRows?: unknown[];
  keywordError?: unknown;
};

function mockDb({ rpc, keywordRows = [], keywordError = null }: MockOptions) {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "or", "in", "order"]) {
    chain[name] = () => chain;
  }
  chain.limit = () =>
    Promise.resolve({ data: keywordRows, error: keywordError });
  return {
    rpc: vi.fn(rpc ?? (() => Promise.resolve({ data: [], error: null }))),
    from: vi.fn(() => chain),
  } as never;
}

beforeEach(() => {
  embedText.mockReset();
  embedText.mockResolvedValue([0.1, 0.2]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadDynamicAssessmentKnowledge 기록", () => {
  it("벡터 검색 성공이면 검색 행 1개를 vector 로 남긴다", async () => {
    const supabase = mockDb({
      rpc: () => Promise.resolve({ data: ROWS, error: null }),
    });
    const trace = createAiTrace(CTX);
    const result = await loadDynamicAssessmentKnowledge({
      supabase,
      purpose: "topic",
      maxItems: 6,
      telemetry: trace,
    });
    expect(result.source).toBe("vector");
    expect(trace.searches).toHaveLength(1);
    expect(trace.searches[0]).toMatchObject({
      kind: "knowledge",
      knowledge_type: "topic_pattern",
      threshold: TOPIC_MATCH_THRESHOLD,
      match_count_requested: 12,
      raw_hits: 2,
      packed_hits: result.hitCount,
      top_score: 0.81,
      source: "vector",
      degraded: false,
      injected_chars: result.injectedChars,
      status: "ok",
      hit_resource_ids: ["k1", "k2"],
    });
    expect(typeof trace.searches[0]?.embed_ms).toBe("number");
    // 질의 임베딩에는 telemetry 를 넘기지 않는다.
    expect(embedText).toHaveBeenCalledWith(expect.any(String));
    expect(embedText.mock.calls[0]).toHaveLength(1);
  });

  it("자료 검색은 verified_resource 임계값을 쓴다", async () => {
    const supabase = mockDb({
      rpc: () => Promise.resolve({ data: ROWS, error: null }),
    });
    const trace = createAiTrace(CTX);
    await loadDynamicAssessmentKnowledge({
      supabase,
      purpose: "resource",
      telemetry: trace,
    });
    expect(trace.searches[0]).toMatchObject({
      knowledge_type: "verified_resource",
      threshold: RESOURCE_MATCH_THRESHOLD,
    });
  });

  it("결과가 비면 source none 이고 degraded 는 false 다", async () => {
    const trace = createAiTrace(CTX);
    await loadDynamicAssessmentKnowledge({
      supabase: mockDb({}),
      telemetry: trace,
    });
    expect(trace.searches[0]).toMatchObject({
      source: "none",
      degraded: false,
      raw_hits: 0,
      packed_hits: 0,
      status: "ok",
    });
  });

  it("벡터가 throw 하고 키워드가 성공하면 degraded keyword 로 남긴다", async () => {
    const supabase = mockDb({
      rpc: () => Promise.reject(new Error("rpc down")),
      keywordRows: ROWS,
    });
    const trace = createAiTrace(CTX);
    const result = await loadDynamicAssessmentKnowledge({
      supabase,
      telemetry: trace,
    });
    expect(result.source).toBe("keyword");
    expect(trace.searches[0]).toMatchObject({
      source: "keyword",
      degraded: true,
      raw_hits: 2,
      top_score: null,
      embed_ms: null,
      status: "ok",
    });
  });

  it("두 경로가 모두 throw 하면 status error 로 남긴다", async () => {
    const supabase = mockDb({
      rpc: () => Promise.reject(new Error("rpc down")),
      keywordError: new Error("table gone"),
    });
    const trace = createAiTrace(CTX);
    const result = await loadDynamicAssessmentKnowledge({
      supabase,
      telemetry: trace,
    });
    expect(result).toMatchObject({ text: "", source: "none", degraded: true });
    expect(trace.searches[0]).toMatchObject({
      status: "error",
      degraded: true,
      source: "none",
      error_message: "table gone",
    });
  });

  it("telemetry 가 없어도 반환값이 같다", async () => {
    const supabase = mockDb({
      rpc: () => Promise.resolve({ data: ROWS, error: null }),
    });
    const withTrace = await loadDynamicAssessmentKnowledge({
      supabase,
      telemetry: createAiTrace(CTX),
    });
    const without = await loadDynamicAssessmentKnowledge({ supabase });
    expect(without).toEqual(withTrace);
  });
});

describe("loadRelevantStudentSessions 기록", () => {
  it("성공하면 student_history 행을 남긴다", async () => {
    const supabase = mockDb({
      rpc: () =>
        Promise.resolve({
          data: [{ topic_title: "a", similarity: 0.66 }, { topic_title: "b" }],
          error: null,
        }),
    });
    const trace = createAiTrace(CTX);
    const result = await loadRelevantStudentSessions({
      supabase,
      profileId: "p-1",
      matchCount: 8,
      matchThreshold: 0.48,
      telemetry: trace,
    });
    expect(result).toHaveLength(2);
    expect(trace.searches[0]).toMatchObject({
      kind: "student_history",
      knowledge_type: null,
      threshold: 0.48,
      match_count_requested: 8,
      raw_hits: 2,
      packed_hits: 2,
      top_score: 0.66,
      source: "vector",
      degraded: false,
      status: "ok",
      hit_resource_ids: null,
    });
  });

  it("실패하면 빈 배열을 돌려주고 error 행을 남긴다", async () => {
    const supabase = mockDb({
      rpc: () => Promise.reject(new Error("rpc down")),
    });
    const trace = createAiTrace(CTX);
    const result = await loadRelevantStudentSessions({
      supabase,
      profileId: "p-1",
      telemetry: trace,
    });
    expect(result).toEqual([]);
    expect(trace.searches[0]).toMatchObject({
      kind: "student_history",
      status: "error",
      degraded: true,
      error_message: "rpc down",
    });
  });

  it("profileId 가 없으면 기존처럼 throw 한다", async () => {
    await expect(
      loadRelevantStudentSessions({ supabase: mockDb({}) }),
    ).rejects.toThrow("profileId");
  });
});
