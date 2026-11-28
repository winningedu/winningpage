import { readdirSync, readFileSync } from "node:fs";
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
  buildEvalQueryText,
  buildEvalRpc,
  expandSweepGrid,
  HYBRID_FULL_TEXT_WEIGHT,
  HYBRID_RRF_K,
  HYBRID_SEMANTIC_WEIGHT,
  mergeEvalParams,
  mrr,
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

describe("mergeEvalParams", () => {
  test("덮어쓰기 값이 없으면 지식 유형별 운영 검색값을 쓴다", () => {
    expect(mergeEvalParams("topic_pattern", {})).toEqual({
      matchThreshold: TOPIC_MATCH_THRESHOLD,
      rrfK: 60,
      fullTextWeight: 1,
      semanticWeight: 1,
      matchCount: Math.max(TOPIC_MAX_ITEMS * 2, 10),
    });
    expect(mergeEvalParams("verified_resource", {})).toEqual({
      matchThreshold: RESOURCE_MATCH_THRESHOLD,
      rrfK: 60,
      fullTextWeight: 1,
      semanticWeight: 1,
      matchCount: Math.max(RESOURCE_MAX_ITEMS * 2, 10),
    });
  });

  test("들어온 값만 운영값 위에 덮어쓴다", () => {
    expect(
      mergeEvalParams("topic_pattern", {
        rrfK: 20,
        semanticWeight: 2.5,
        matchThreshold: undefined,
      }),
    ).toEqual({
      matchThreshold: TOPIC_MATCH_THRESHOLD,
      rrfK: 20,
      fullTextWeight: 1,
      semanticWeight: 2.5,
      matchCount: Math.max(TOPIC_MAX_ITEMS * 2, 10),
    });
  });
});

describe("하이브리드 운영값", () => {
  test("하이브리드 RPC 마이그레이션의 기본값과 같다", () => {
    const migrationsDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../supabase/migrations",
    );
    const sql = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => readFileSync(path.join(migrationsDir, file), "utf8"))
      .join("\n");
    expect(sql).toContain(`"rrf_k" integer DEFAULT ${HYBRID_RRF_K}`);
    expect(sql).toContain(
      `"full_text_weight" double precision DEFAULT ${HYBRID_FULL_TEXT_WEIGHT}`,
    );
    expect(sql).toContain(
      `"semantic_weight" double precision DEFAULT ${HYBRID_SEMANTIC_WEIGHT}`,
    );
  });
});

describe("expandSweepGrid", () => {
  test("rrf_k, 가중치 쌍, threshold 목록의 모든 조합을 운영 match_count 로 만든다", () => {
    const combos = expandSweepGrid("topic_pattern", {
      rrfK: [20, 60],
      weights: [
        { fullText: 1, semantic: 1 },
        { fullText: 0.5, semantic: 1.5 },
      ],
      matchThreshold: [0.5],
    });
    const matchCount = Math.max(TOPIC_MAX_ITEMS * 2, 10);
    expect(combos).toEqual([
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
    ]);
  });

  test("빈 목록 축은 운영값 하나로 채운다", () => {
    expect(
      expandSweepGrid("verified_resource", {
        rrfK: [10],
        weights: [],
        matchThreshold: [],
      }),
    ).toEqual([
      {
        rrfK: 10,
        fullTextWeight: 1,
        semanticWeight: 1,
        matchThreshold: RESOURCE_MATCH_THRESHOLD,
        matchCount: Math.max(RESOURCE_MAX_ITEMS * 2, 10),
      },
    ]);
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
  const params = mergeEvalParams("verified_resource", {});
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
