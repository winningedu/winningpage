import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  buildKnowledgeKeywordQueryFor,
  buildKnowledgeQueryText,
  RESOURCE_MATCH_THRESHOLD,
  RESOURCE_MAX_ITEMS,
  TOPIC_MATCH_THRESHOLD,
  TOPIC_MAX_ITEMS,
} from "../../performance/knowledge.js";
import {
  buildEvalParams,
  buildEvalQueryText,
  buildEvalRpc,
  buildSweepGrid,
  HYBRID_FULL_TEXT_WEIGHT,
  HYBRID_RRF_K,
  HYBRID_SEMANTIC_WEIGHT,
  mrr,
  parseEvalRequest,
  parseRunsQuery,
  rankOf,
  recallAtK,
  scoreCombos,
  summarizeRun,
} from "./metrics.js";

describe("rankOf", () => {
  test("기대 id 마다 반환 목록 안의 1부터 순위를 주고 없으면 null 이다", () => {
    expect(rankOf(["b", "x", "a"], ["a", "b", "c"])).toEqual([2, null, 1]);
  });
});

describe("recallAtK", () => {
  test("질의마다 상위 k 안에 든 기대 자료 비율을 구해 평균한다", () => {
    const perQuery = [{ ranks: [1, 4] }, { ranks: [null, 2, 3, 9] }];
    // 첫 질의 1/2, 둘째 질의 2/4
    expect(recallAtK(perQuery, 3)).toBe(0.5);
    expect(recallAtK(perQuery, 10)).toBe((2 / 2 + 3 / 4) / 2);
    expect(recallAtK(perQuery, 1)).toBe((1 / 2 + 0) / 2);
  });

  test("질의가 없으면 0 이다", () => {
    expect(recallAtK([], 5)).toBe(0);
  });
});

describe("mrr", () => {
  test("질의마다 가장 앞선 적중 순위의 역수를 구해 평균하고 적중이 없으면 0 이다", () => {
    const perQuery = [
      { ranks: [4, 2] },
      { ranks: [null, null] },
      { ranks: [1] },
    ];
    expect(mrr(perQuery)).toBe((1 / 2 + 0 + 1) / 3);
  });

  test("질의가 없으면 0 이다", () => {
    expect(mrr([])).toBe(0);
  });
});

describe("summarizeRun", () => {
  test("기본 k 1, 3, 5, 10 의 recall 과 MRR 을 묶는다", () => {
    const perQuery = [{ ranks: [2] }, { ranks: [null] }];
    expect(summarizeRun(perQuery)).toEqual({
      recall: { "1": 0, "3": 0.5, "5": 0.5, "10": 0.5 },
      mrr: 0.25,
    });
  });

  test("k 목록을 바꿀 수 있다", () => {
    expect(summarizeRun([{ ranks: [1] }], [2])).toEqual({
      recall: { "2": 1 },
      mrr: 1,
    });
  });
});

describe("buildEvalParams", () => {
  test("덮어쓰기 값이 없으면 지식 유형별 운영 검색값을 쓴다", () => {
    expect(buildEvalParams({ knowledgeType: "topic_pattern" })).toEqual({
      ok: true,
      params: {
        matchThreshold: TOPIC_MATCH_THRESHOLD,
        rrfK: 60,
        fullTextWeight: 1,
        semanticWeight: 1,
        matchCount: Math.max(TOPIC_MAX_ITEMS * 2, 10),
      },
    });
    expect(buildEvalParams({ knowledgeType: "verified_resource" })).toEqual({
      ok: true,
      params: {
        matchThreshold: RESOURCE_MATCH_THRESHOLD,
        rrfK: 60,
        fullTextWeight: 1,
        semanticWeight: 1,
        matchCount: Math.max(RESOURCE_MAX_ITEMS * 2, 10),
      },
    });
  });
});

describe("하이브리드 운영값", () => {
  test("하이브리드 RPC 마이그레이션의 기본값과 같다", () => {
    const sql = readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../../supabase/migrations/20261007053142_knowledge_hybrid_search.sql",
      ),
      "utf8",
    );
    expect(sql).toContain(`rrf_k integer default ${HYBRID_RRF_K}`);
    expect(sql).toContain(
      `full_text_weight double precision default ${HYBRID_FULL_TEXT_WEIGHT}`,
    );
    expect(sql).toContain(
      `semantic_weight double precision default ${HYBRID_SEMANTIC_WEIGHT}`,
    );
  });
});

describe("buildEvalParams 덮어쓰기", () => {
  test("들어온 값만 운영값 위에 덮어쓰고 null 과 빈 값은 운영값을 둔다", () => {
    const result = buildEvalParams({
      knowledgeType: "topic_pattern",
      overrides: { rrfK: 20, semanticWeight: 2.5, matchThreshold: null },
    });
    expect(result).toEqual({
      ok: true,
      params: {
        matchThreshold: TOPIC_MATCH_THRESHOLD,
        rrfK: 20,
        fullTextWeight: 1,
        semanticWeight: 2.5,
        matchCount: Math.max(TOPIC_MAX_ITEMS * 2, 10),
      },
    });
  });

  test.each([
    [{ matchThreshold: -0.1 }, "matchThreshold"],
    [{ matchThreshold: 1.1 }, "matchThreshold"],
    [{ rrfK: 0 }, "rrfK"],
    [{ rrfK: 201 }, "rrfK"],
    [{ rrfK: 10.5 }, "rrfK"],
    [{ fullTextWeight: 5.1 }, "fullTextWeight"],
    [{ semanticWeight: -1 }, "semanticWeight"],
    [{ matchCount: 0 }, "matchCount"],
    [{ matchCount: 21 }, "matchCount"],
    [{ matchCount: 3.5 }, "matchCount"],
    [{ matchThreshold: "0.5" }, "matchThreshold"],
  ])("범위를 벗어난 값 %o 는 %s 이유로 거절한다", (overrides, key) => {
    const result = buildEvalParams({
      knowledgeType: "topic_pattern",
      overrides,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(key);
  });

  test("경계값은 받는다", () => {
    const result = buildEvalParams({
      knowledgeType: "verified_resource",
      overrides: {
        matchThreshold: 0,
        rrfK: 200,
        fullTextWeight: 0,
        semanticWeight: 5,
        matchCount: 20,
      },
    });
    expect(result.ok).toBe(true);
  });

  test("overrides 가 객체가 아니면 거절한다", () => {
    expect(
      buildEvalParams({ knowledgeType: "topic_pattern", overrides: 3 }).ok,
    ).toBe(false);
  });
});

describe("buildSweepGrid", () => {
  test("rrf_k, 가중치 쌍, threshold 목록의 모든 조합을 운영 match_count 로 만든다", () => {
    const result = buildSweepGrid({
      knowledgeType: "topic_pattern",
      grid: {
        rrfK: [20, 60],
        weights: [
          { fullText: 1, semantic: 1 },
          { fullText: 0.5, semantic: 1.5 },
        ],
        matchThreshold: [0.5],
      },
    });
    const matchCount = Math.max(TOPIC_MAX_ITEMS * 2, 10);
    expect(result).toEqual({
      ok: true,
      combos: [
        {
          rrfK: 20,
          fullTextWeight: 1,
          semanticWeight: 1,
          matchThreshold: 0.5,
          matchCount,
        },
        {
          rrfK: 20,
          fullTextWeight: 0.5,
          semanticWeight: 1.5,
          matchThreshold: 0.5,
          matchCount,
        },
        {
          rrfK: 60,
          fullTextWeight: 1,
          semanticWeight: 1,
          matchThreshold: 0.5,
          matchCount,
        },
        {
          rrfK: 60,
          fullTextWeight: 0.5,
          semanticWeight: 1.5,
          matchThreshold: 0.5,
          matchCount,
        },
      ],
    });
  });

  test("빈 목록 축은 운영값 하나로 채운다", () => {
    const result = buildSweepGrid({
      knowledgeType: "verified_resource",
      grid: { rrfK: [10], weights: [], matchThreshold: [] },
    });
    expect(result.ok && result.combos).toEqual([
      {
        rrfK: 10,
        fullTextWeight: 1,
        semanticWeight: 1,
        matchThreshold: RESOURCE_MATCH_THRESHOLD,
        matchCount: Math.max(RESOURCE_MAX_ITEMS * 2, 10),
      },
    ]);
  });

  test("조합이 24개를 넘으면 거절한다", () => {
    const result = buildSweepGrid({
      knowledgeType: "topic_pattern",
      grid: {
        rrfK: [10, 20, 30, 40, 50],
        weights: [
          { fullText: 1, semantic: 1 },
          { fullText: 2, semantic: 1 },
        ],
        matchThreshold: [0.4, 0.5, 0.6],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("24");
  });

  test("범위를 벗어난 값이 섞이면 거절한다", () => {
    const result = buildSweepGrid({
      knowledgeType: "topic_pattern",
      grid: { rrfK: [0], weights: [], matchThreshold: [] },
    });
    expect(result.ok === false && result.reason).toContain("rrfK");
  });

  test("grid 모양이 틀리면 거절한다", () => {
    expect(
      buildSweepGrid({ knowledgeType: "topic_pattern", grid: { rrfK: 3 } }).ok,
    ).toBe(false);
    expect(
      buildSweepGrid({
        knowledgeType: "topic_pattern",
        grid: { weights: [{ fullText: 1 }] },
      }).ok,
    ).toBe(false);
  });
});

describe("parseEvalRequest", () => {
  test("run 은 지식 유형, 모드, 합쳐진 파라미터, 메모를 돌려준다", () => {
    expect(
      parseEvalRequest({
        action: "run",
        knowledgeType: "topic_pattern",
        mode: "vector",
        params: { rrfK: 30 },
        note: " 첫 측정 ",
      }),
    ).toEqual({
      ok: true,
      request: {
        action: "run",
        knowledgeType: "topic_pattern",
        mode: "vector",
        params: {
          matchThreshold: TOPIC_MATCH_THRESHOLD,
          rrfK: 30,
          fullTextWeight: 1,
          semanticWeight: 1,
          matchCount: Math.max(TOPIC_MAX_ITEMS * 2, 10),
        },
        note: "첫 측정",
      },
    });
  });

  test("run 의 mode 기본값은 hybrid 이고 메모가 없으면 null 이다", () => {
    const result = parseEvalRequest({
      action: "run",
      knowledgeType: "verified_resource",
    });
    expect(result.ok && result.request).toMatchObject({
      mode: "hybrid",
      note: null,
    });
  });

  test("sweep 은 조합 목록을 돌려주고 모드는 hybrid 로 고정이다", () => {
    const result = parseEvalRequest({
      action: "sweep",
      knowledgeType: "topic_pattern",
      grid: { rrfK: [20, 60] },
    });
    expect(result.ok && result.request.action).toBe("sweep");
    expect(
      result.ok && result.request.action === "sweep" && result.request.combos,
    ).toHaveLength(2);
  });

  test.each([
    [null, "요청"],
    [{ action: "delete", knowledgeType: "topic_pattern" }, "action"],
    [{ action: "run", knowledgeType: "x" }, "knowledgeType"],
    [{ action: "run", knowledgeType: "topic_pattern", mode: "bm25" }, "mode"],
    [{ action: "run", knowledgeType: "topic_pattern", note: 3 }, "note"],
    [
      { action: "run", knowledgeType: "topic_pattern", params: { rrfK: 0 } },
      "rrfK",
    ],
    [{ action: "sweep", knowledgeType: "topic_pattern" }, "grid"],
  ])("잘못된 요청 %o 는 %s 이유로 거절한다", (raw, key) => {
    const result = parseEvalRequest(raw);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(key);
  });
});

const golden = {
  id: "q1",
  knowledge_type: "verified_resource",
  grade: "고2",
  subject: "물리학Ⅰ",
  career: "기계공학",
  selected_topic: "마찰력",
  assessment_info: "실험 보고서",
  expected_resource_ids: ["r1"],
};

describe("buildEvalQueryText", () => {
  test("학생 요청 경로와 같은 질의문을 만든다", () => {
    expect(buildEvalQueryText(golden)).toBe(
      buildKnowledgeQueryText({
        grade: "고2",
        subject: "물리학Ⅰ",
        career: "기계공학",
        selectedTopic: "마찰력",
        assessmentInfo: "실험 보고서",
      }),
    );
  });

  test("비어 있는 선택 칸은 빈 값으로 넣는다", () => {
    const text = buildEvalQueryText({
      ...golden,
      career: null,
      selected_topic: null,
      assessment_info: null,
    });
    expect(text).toContain("희망 진로: \n");
  });
});

describe("buildEvalRpc", () => {
  const params = {
    matchThreshold: 0.4,
    rrfK: 30,
    fullTextWeight: 2,
    semanticWeight: 0.5,
    matchCount: 16,
  };

  test("hybrid 는 하이브리드 RPC 에 실제 경로의 필터와 단어 질의, 평가 파라미터를 넘긴다", () => {
    expect(buildEvalRpc(golden, [0.1, 0.2], "hybrid", params)).toEqual({
      fn: "match_winning_suhaeng_hybrid",
      args: {
        query_embedding: [0.1, 0.2],
        query_keywords: buildKnowledgeKeywordQueryFor({
          subject: "물리학Ⅰ",
          career: "기계공학",
          selectedTopic: "마찰력",
        }),
        filter_knowledge_type: "verified_resource",
        filter_grade: "고2",
        // 자료 검색은 학생 요청 경로에서 다른 과목을 빼므로 정규화 교과군으로 거른다.
        filter_subject: "과학",
        match_count: 16,
        match_threshold: 0.4,
        rrf_k: 30,
        full_text_weight: 2,
        semantic_weight: 0.5,
      },
    });
  });

  test("주제 검색은 학생 요청 경로처럼 과목 필터를 걸지 않는다", () => {
    const rpc = buildEvalRpc(
      { ...golden, knowledge_type: "topic_pattern" },
      [0.1],
      "hybrid",
      params,
    );
    expect(rpc.args.filter_subject).toBeNull();
  });

  test("vector 는 벡터 RPC 에 RRF 인자 없이 넘긴다", () => {
    expect(buildEvalRpc(golden, [0.1], "vector", params)).toEqual({
      fn: "match_winning_suhaeng_all_subjects",
      args: {
        query_embedding: [0.1],
        filter_knowledge_type: "verified_resource",
        filter_grade: "고2",
        filter_subject: "과학",
        match_count: 16,
        match_threshold: 0.4,
      },
    });
  });
});

describe("scoreCombos", () => {
  const base = buildEvalParams({ knowledgeType: "verified_resource" });
  const params = base.ok ? base.params : (undefined as never);
  const queries = [
    { ...golden, id: "q1", expected_resource_ids: ["r1", "r2"] },
    { ...golden, id: "q2", selected_topic: "", expected_resource_ids: ["r9"] },
  ];
  const embeddings = new Map([
    ["q1", [1]],
    ["q2", [2]],
  ]);

  test("조합마다 질의별 반환 id 로 순위를 매기고 지표를 낸다", async () => {
    const seen: string[] = [];
    const results = await scoreCombos({
      queries,
      embeddings,
      mode: "hybrid",
      combos: [params],
      deadlineAt: Number.POSITIVE_INFINITY,
      search: async (query, embedding) => {
        seen.push(`${query.id}:${embedding[0]}`);
        return query.id === "q1" ? ["r2", "x", "r1"] : ["x"];
      },
    });
    expect(seen).toEqual(["q1:1", "q2:2"]);
    expect(results).toEqual([
      {
        status: "done",
        params,
        metrics: summarizeRun([{ ranks: [3, 1] }, { ranks: [null] }]),
        perQuery: [
          {
            queryId: "q1",
            label: "고2 물리학Ⅰ 마찰력",
            expectedIds: ["r1", "r2"],
            ranks: [3, 1],
          },
          {
            queryId: "q2",
            label: "고2 물리학Ⅰ 기계공학",
            expectedIds: ["r9"],
            ranks: [null],
          },
        ],
      },
    ]);
  });

  test("시간 예산이 지나면 아직 시작하지 않은 조합은 skipped 로 둔다", async () => {
    let clock = 0;
    const other = { ...params, rrfK: 10 };
    const results = await scoreCombos({
      queries,
      embeddings,
      mode: "hybrid",
      combos: [params, other],
      deadlineAt: 5,
      now: () => clock,
      search: async () => {
        clock += 10;
        return [];
      },
    });
    expect(results.map((r) => r.status)).toEqual(["done", "skipped"]);
    expect(results[1]).toEqual({ status: "skipped", params: other });
  });
});

describe("parseRunsQuery", () => {
  test("view=runs 와 선택적 지식 유형을 읽는다", () => {
    expect(parseRunsQuery({ view: "runs" })).toEqual({
      ok: true,
      knowledgeType: null,
    });
    expect(
      parseRunsQuery({ view: "runs", knowledgeType: "verified_resource" }),
    ).toEqual({ ok: true, knowledgeType: "verified_resource" });
  });

  test("view 가 runs 가 아니거나 지식 유형이 틀리면 거절한다", () => {
    expect(parseRunsQuery({ view: "calls" }).ok).toBe(false);
    expect(parseRunsQuery({ view: "runs", knowledgeType: "x" }).ok).toBe(false);
  });
});
