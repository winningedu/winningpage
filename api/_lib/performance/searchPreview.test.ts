import { describe, expect, it } from "vitest";

import {
  RESOURCE_MATCH_THRESHOLD,
  TOPIC_MATCH_THRESHOLD,
  TOPIC_MAX_CHARS,
} from "./knowledge.js";
import {
  buildSearchPreviewItems,
  buildSearchPreviewRpc,
  validateSearchPreviewBody,
} from "./searchPreview.js";

function row(id: string, similarity: number, content = "내용") {
  return {
    id,
    title: `제목 ${id}`,
    grade: "고2",
    subject: "과학",
    career_field: "공학",
    content,
    similarity,
  };
}

describe("validateSearchPreviewBody", () => {
  it("주제 DB 는 다른 과목을 포함하고 상한 기본값은 20이다", () => {
    const parsed = validateSearchPreviewBody({
      knowledgeType: "topic_pattern",
      grade: "고2",
      subject: "물리학",
      career: "기계공학",
    });
    expect(parsed).toEqual({
      ok: true,
      body: {
        knowledgeType: "topic_pattern",
        grade: "고2",
        subject: "물리학",
        career: "기계공학",
        selectedTopic: "",
        assessmentInfo: "",
        includeOtherSubjects: true,
        limit: 20,
        mode: "hybrid",
      },
    });
  });

  it("검색 방식은 기본 hybrid 이고 vector 를 고를 수 있으며 다른 값은 거절한다", () => {
    const vector = validateSearchPreviewBody({
      knowledgeType: "topic_pattern",
      mode: "vector",
    });
    expect(vector.ok && vector.body.mode).toBe("vector");
    expect(
      validateSearchPreviewBody({
        knowledgeType: "topic_pattern",
        mode: "bm25",
      }).ok,
    ).toBe(false);
  });

  it("자료 DB 는 기본으로 다른 과목을 빼고 지정값은 그대로 쓴다", () => {
    const parsed = validateSearchPreviewBody({
      knowledgeType: "verified_resource",
      grade: "",
      subject: "국어",
      career: "",
      limit: 5,
    });
    expect(parsed.ok && parsed.body.includeOtherSubjects).toBe(false);
    expect(parsed.ok && parsed.body.limit).toBe(5);

    const forced = validateSearchPreviewBody({
      knowledgeType: "verified_resource",
      subject: "국어",
      includeOtherSubjects: true,
    });
    expect(forced.ok && forced.body.includeOtherSubjects).toBe(true);
  });

  it("허용하지 않는 유형, 범위 밖 상한, 잘못된 바디를 거절한다", () => {
    expect(validateSearchPreviewBody(null).ok).toBe(false);
    expect(
      validateSearchPreviewBody({ knowledgeType: "student_record_pattern" }).ok,
    ).toBe(false);
    expect(
      validateSearchPreviewBody({ knowledgeType: "topic_pattern", limit: 0 })
        .ok,
    ).toBe(false);
    expect(
      validateSearchPreviewBody({ knowledgeType: "topic_pattern", limit: 51 })
        .ok,
    ).toBe(false);
    expect(
      validateSearchPreviewBody({ knowledgeType: "topic_pattern", limit: 2.5 })
        .ok,
    ).toBe(false);
    expect(
      validateSearchPreviewBody({ knowledgeType: "topic_pattern", grade: 3 })
        .ok,
    ).toBe(false);
  });
});

describe("buildSearchPreviewItems", () => {
  it("순위를 매기고 threshold 통과와 실제 주입 여부를 판정한다", () => {
    const result = buildSearchPreviewItems("topic_pattern", [
      row("a", 0.8),
      row("b", 0.5),
      row("c", 0.49),
    ]);
    expect(result.threshold).toBe(TOPIC_MATCH_THRESHOLD);
    expect(result.items).toEqual([
      {
        rank: 1,
        id: "a",
        title: "제목 a",
        grade: "고2",
        subject: "과학",
        career_field: "공학",
        similarity: 0.8,
        passesThreshold: true,
        wouldBeInjected: true,
      },
      expect.objectContaining({
        rank: 2,
        id: "b",
        passesThreshold: true,
        wouldBeInjected: true,
      }),
      expect.objectContaining({
        rank: 3,
        id: "c",
        passesThreshold: false,
        wouldBeInjected: false,
      }),
    ]);
  });

  it("자료 DB 는 자료 threshold 를 쓴다", () => {
    const result = buildSearchPreviewItems("verified_resource", [
      row("a", 0.485),
    ]);
    expect(result.threshold).toBe(RESOURCE_MATCH_THRESHOLD);
    expect(result.items[0]?.passesThreshold).toBe(true);
  });

  it("주제 DB 는 통과 행이 많아도 앞 6건만 주입된다", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      row(`r${i}`, 0.9 - i / 100),
    );
    const injected = buildSearchPreviewItems("topic_pattern", rows).items.map(
      (item) => item.wouldBeInjected,
    );
    expect(injected).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("글자 상한을 넘긴 행부터는 뒤가 짧아도 주입되지 않는다", () => {
    const result = buildSearchPreviewItems("topic_pattern", [
      row("a", 0.9),
      row("b", 0.8, "가".repeat(TOPIC_MAX_CHARS)),
      row("c", 0.7),
    ]);
    expect(result.items.map((item) => item.wouldBeInjected)).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe("buildSearchPreviewItems hybrid", () => {
  function fused(
    id: string,
    similarity: number,
    ranks: { semantic: number | null; keyword: number | null; rrf: number },
  ) {
    return {
      ...row(id, similarity),
      semantic_rank: ranks.semantic,
      keyword_rank: ranks.keyword,
      rrf_score: ranks.rrf,
    };
  }

  it("두 순위와 RRF 점수를 붙이고 단어로만 걸린 행도 RPC 순서대로 주입한다", () => {
    const result = buildSearchPreviewItems(
      "topic_pattern",
      [
        fused("both", 0.8, { semantic: 1, keyword: 2, rrf: 0.0325 }),
        fused("kw", 0.42, { semantic: null, keyword: 1, rrf: 0.0164 }),
        fused("sem", 0.7, { semantic: 2, keyword: null, rrf: 0.0161 }),
      ],
      "hybrid",
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        rank: 1,
        id: "both",
        semanticRank: 1,
        keywordRank: 2,
        rrfScore: 0.0325,
        passesThreshold: true,
        wouldBeInjected: true,
      }),
      expect.objectContaining({
        rank: 2,
        id: "kw",
        semanticRank: null,
        keywordRank: 1,
        similarity: 0.42,
        passesThreshold: false,
        wouldBeInjected: true,
      }),
      expect.objectContaining({ rank: 3, id: "sem", wouldBeInjected: true }),
    ]);
  });

  it("hybrid 도 앞 6건까지만 주입된다", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      fused(`r${i}`, 0.3, { semantic: null, keyword: i + 1, rrf: 0.01 }),
    );
    expect(
      buildSearchPreviewItems("topic_pattern", rows, "hybrid").items.map(
        (item) => item.wouldBeInjected,
      ),
    ).toEqual([true, true, true, true, true, true, false, false]);
  });

  it("vector 결과에는 하이브리드 순위 필드가 없다", () => {
    const item = buildSearchPreviewItems("topic_pattern", [row("a", 0.8)])
      .items[0];
    expect(item).not.toHaveProperty("rrfScore");
  });
});

describe("buildSearchPreviewRpc", () => {
  const base = {
    grade: "고2 이과",
    subject: "물리학",
    career: "",
    selectedTopic: "",
    assessmentInfo: "",
    limit: 15,
  };

  it("vector 는 기존 RPC 를 threshold 0 과 요청 상한으로 부르고 학년은 실제 경로처럼 정규화한다", () => {
    expect(
      buildSearchPreviewRpc(
        {
          ...base,
          knowledgeType: "topic_pattern",
          includeOtherSubjects: true,
          mode: "vector",
        },
        [0.1, 0.2],
      ),
    ).toEqual({
      fn: "match_winning_suhaeng_all_subjects",
      args: {
        query_embedding: [0.1, 0.2],
        filter_knowledge_type: "topic_pattern",
        filter_grade: "고2",
        filter_subject: null,
        match_count: 15,
        match_threshold: 0,
      },
    });
  });

  it("hybrid 는 실제 경로 threshold 와 단어 질의로 하이브리드 RPC 를 부른다", () => {
    expect(
      buildSearchPreviewRpc(
        {
          ...base,
          career: "기계공학",
          knowledgeType: "verified_resource",
          includeOtherSubjects: false,
          mode: "hybrid",
        },
        [0.1],
      ),
    ).toEqual({
      fn: "match_winning_suhaeng_hybrid",
      args: {
        query_embedding: [0.1],
        query_keywords: '"물리학" OR "과학" OR "기계공학"',
        filter_knowledge_type: "verified_resource",
        filter_grade: "고2",
        filter_subject: "과학",
        match_count: 15,
        match_threshold: RESOURCE_MATCH_THRESHOLD,
      },
    });
  });

  it("다른 과목을 빼면 정규화한 교과군으로 거른다", () => {
    expect(
      buildSearchPreviewRpc(
        {
          ...base,
          knowledgeType: "verified_resource",
          includeOtherSubjects: false,
          mode: "vector",
        },
        [0.1],
      ).args.filter_subject,
    ).toBe("과학");
  });
});
