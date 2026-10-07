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
  buildKnowledgeQueryText,
  loadDynamicAssessmentKnowledge,
  loadRelevantStudentSessions,
  RESOURCE_MATCH_THRESHOLD,
  TOPIC_MATCH_THRESHOLD,
} from "./knowledge.js";
import { buildKnowledgeKeywordQuery } from "./knowledgeKeywords.js";

const CTX = { service: "performance" as const, feature: "recommend_topics" };

const ROWS = [
  { id: "k1", title: "주제 하나", content: "내용 하나", similarity: 0.81 },
  { id: "k2", title: "주제 둘", content: "내용 둘", similarity: 0.7 },
];

type MockOptions = {
  rpc?: (name: string, args: Record<string, unknown>) => unknown;
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
  it("하이브리드 검색 성공이면 검색 행 1개를 hybrid 로 남긴다", async () => {
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
    expect(result.source).toBe("hybrid");
    expect(trace.searches).toHaveLength(1);
    expect(trace.searches[0]).toMatchObject({
      kind: "knowledge",
      knowledge_type: "topic_pattern",
      threshold: TOPIC_MATCH_THRESHOLD,
      match_count_requested: 12,
      raw_hits: 2,
      packed_hits: result.hitCount,
      top_score: 0.81,
      source: "hybrid",
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

  it("하이브리드 RPC 에 단어 질의와 벡터 경로와 같은 필터를 넘긴다", async () => {
    const supabase = mockDb({});
    await loadDynamicAssessmentKnowledge({
      supabase,
      grade: "고2",
      subject: "물리학Ⅰ",
      career: "의학 / 생명과학",
      selectedTopic: "항생제 내성",
      purpose: "resource",
      maxItems: 8,
      includeOtherSubjects: false,
    });
    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).toHaveBeenCalledWith("match_winning_suhaeng_hybrid", {
      query_embedding: [0.1, 0.2],
      query_keywords: buildKnowledgeKeywordQuery({
        subject: "물리학Ⅰ",
        normalizedSubject: "과학",
        career: "의학 / 생명과학",
        selectedTopic: "항생제 내성",
      }),
      filter_knowledge_type: "verified_resource",
      filter_grade: "고2",
      match_count: 16,
      match_threshold: RESOURCE_MATCH_THRESHOLD,
      filter_subject: "과학",
    });
  });

  it("하이브리드 행은 RRF 순서를 지키고 계기판 top_score 는 유사도 최댓값이다", async () => {
    const fused = [
      { id: "kw", title: "단어 일치", content: "가", similarity: 0.42 },
      { id: "both", title: "둘 다", content: "나", similarity: 0.77 },
      { id: "sem", title: "뜻 일치", content: "다", similarity: 0.9 },
    ];
    const supabase = mockDb({
      rpc: () => Promise.resolve({ data: fused, error: null }),
    });
    const trace = createAiTrace(CTX);
    const result = await loadDynamicAssessmentKnowledge({
      supabase,
      maxItems: 2,
      telemetry: trace,
    });
    expect(result.rows.map((row) => row.id)).toEqual(["kw", "both"]);
    // 단어로만 걸린 행도 유사도 줄이 같은 형식으로 들어간다.
    expect(result.text).toContain("- 유사도: 0.4200");
    expect(trace.searches[0]).toMatchObject({
      source: "hybrid",
      raw_hits: 3,
      packed_hits: 2,
      top_score: 0.9,
    });
  });

  it("하이브리드 행도 maxChars 상한에서 packRows 가 자른다", async () => {
    const long = [
      { id: "a", title: "가", content: "x".repeat(100), similarity: 0.6 },
      { id: "b", title: "나", content: "y".repeat(100), similarity: 0.6 },
    ];
    const result = await loadDynamicAssessmentKnowledge({
      supabase: mockDb({
        rpc: () => Promise.resolve({ data: long, error: null }),
      }),
      maxChars: 250,
    });
    expect(result.rows.map((row) => row.id)).toEqual(["a"]);
    expect(result.injectedChars).toBe(result.text.length);
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

  it("하이브리드가 throw 하고 벡터가 성공하면 degraded vector 로 남긴다", async () => {
    const supabase = mockDb({
      rpc: (name: string) =>
        name === "match_winning_suhaeng_hybrid"
          ? Promise.reject(new Error("pgroonga missing"))
          : Promise.resolve({ data: ROWS, error: null }),
    });
    const trace = createAiTrace(CTX);
    const result = await loadDynamicAssessmentKnowledge({
      supabase,
      telemetry: trace,
    });
    expect(result).toMatchObject({
      source: "vector",
      degraded: true,
      hitCount: 2,
    });
    expect(
      (
        supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
      ).rpc.mock.calls.map((call) => call[0]),
    ).toEqual([
      "match_winning_suhaeng_hybrid",
      "match_winning_suhaeng_all_subjects",
    ]);
    // 질의 임베딩은 두 경로가 하나를 같이 쓴다.
    expect(embedText).toHaveBeenCalledTimes(1);
    expect(trace.searches[0]).toMatchObject({
      source: "vector",
      degraded: true,
      top_score: 0.81,
      status: "ok",
      error_message: null,
    });
  });

  it("하이브리드와 벡터가 모두 throw 하고 키워드가 성공하면 degraded keyword 로 남긴다", async () => {
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

  it("세 경로가 모두 throw 하면 status error 로 남긴다", async () => {
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

describe("buildKnowledgeQueryText", () => {
  it("6줄 질의문을 원문 그대로 만들고 안내문은 2500자에서 자른다", () => {
    const longInfo = "가".repeat(2600);
    expect(
      buildKnowledgeQueryText({
        grade: "고2",
        subject: "물리학",
        career: "기계공학",
        selectedTopic: "마찰력",
        assessmentInfo: longInfo,
      }),
    ).toBe(
      [
        "학년: 고2",
        "현재 과목: 물리학",
        "정규화 과목군: 과학",
        "희망 진로: 기계공학",
        "선택 또는 이전 주제: 마찰력",
        `수행평가 안내문: ${"가".repeat(2500)}`,
      ].join("\n"),
    );
  });

  it("빈 입력은 라벨만 남긴다", () => {
    expect(buildKnowledgeQueryText({})).toBe(
      [
        "학년: ",
        "현재 과목: ",
        "정규화 과목군: 국어",
        "희망 진로: ",
        "선택 또는 이전 주제: ",
        "수행평가 안내문: ",
      ].join("\n"),
    );
  });

  it("벡터 검색은 이 함수가 만든 문자열을 임베딩한다", async () => {
    const supabase = mockDb({
      rpc: () => Promise.resolve({ data: ROWS, error: null }),
    });
    await loadDynamicAssessmentKnowledge({
      supabase,
      grade: "고1",
      subject: "국어",
      career: "교사",
      selectedTopic: "",
      assessmentInfo: "안내",
    });
    expect(embedText).toHaveBeenCalledWith(
      buildKnowledgeQueryText({
        grade: "고1",
        subject: "국어",
        career: "교사",
        selectedTopic: "",
        assessmentInfo: "안내",
      }),
    );
  });
});
