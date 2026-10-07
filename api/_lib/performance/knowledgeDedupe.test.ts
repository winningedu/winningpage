import { describe, expect, it, vi } from "vitest";

import {
  contentHash,
  detectKnowledgeDuplicates,
  KNOWLEDGE_NEAR_DUPLICATE_THRESHOLD,
  MAX_DEDUPE_ITEMS,
  matchExactDuplicates,
  normalizeForHash,
  validateDedupeBody,
} from "./knowledgeDedupe.js";

describe("normalizeForHash", () => {
  it("공백 차이, 대소문자, 전각 문자가 달라도 같은 문자열이 된다", () => {
    expect(normalizeForHash("  AI  윤리\t토론 ", "핵심   내용")).toBe(
      normalizeForHash("ai 윤리 토론", "핵심 내용"),
    );
    expect(normalizeForHash("ＡＩ　윤리", "Ｘ")).toBe(
      normalizeForHash("ai 윤리", "x"),
    );
  });

  it("구두점을 지우고 비교한다", () => {
    expect(normalizeForHash("AI, 윤리!", "“핵심” 내용.")).toBe(
      normalizeForHash("AI 윤리", "핵심 내용"),
    );
  });

  it("제목과 내용의 경계는 섞이지 않는다", () => {
    expect(normalizeForHash("ab", "c")).not.toBe(normalizeForHash("a", "bc"));
  });
});

describe("contentHash", () => {
  it("정규화한 제목과 내용의 SHA-256 hex 를 돌려준다", async () => {
    // node 의 createHash("sha256") 로 "ai 윤리\n핵심 내용" 을 미리 계산한 값이다.
    await expect(contentHash(" AI, 윤리 ", "핵심   내용")).resolves.toBe(
      "3edd89992acfedabb618ad0f1f8630b8cae9191f02d2ba0fdaf64d7d379b3774",
    );
  });
});

describe("matchExactDuplicates", () => {
  it("정규화 해시가 같은 기존 행을 신규 행마다 모은다", async () => {
    const existing = [
      { id: "e1", title: "AI 윤리", content: "핵심 내용" },
      { id: "e2", title: "다른 주제", content: "다른 내용" },
      { id: "e3", title: "ai  윤리", content: "핵심, 내용" },
    ];
    const items = [
      { rowNo: 2, title: "ＡＩ 윤리", content: "핵심 내용" },
      { rowNo: 3, title: "새 주제", content: "새 내용" },
    ];

    await expect(matchExactDuplicates(items, existing)).resolves.toEqual([
      {
        rowNo: 2,
        exact: [
          { id: "e1", title: "AI 윤리" },
          { id: "e3", title: "ai  윤리" },
        ],
      },
      { rowNo: 3, exact: [] },
    ]);
  });
});

describe("validateDedupeBody", () => {
  const item = { rowNo: 2, title: "제목", content: "내용", grade: "고1" };

  it("허용된 knowledgeType 과 항목 목록을 통과시킨다", () => {
    const parsed = validateDedupeBody({
      knowledgeType: "verified_resource",
      items: [item],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.body.knowledgeType).toBe("verified_resource");
      expect(parsed.body.items[0]).toMatchObject({
        rowNo: 2,
        title: "제목",
        content: "내용",
        grade: "고1",
        subject: "",
      });
    }
  });

  it("수정 행의 id 는 자기 자신 제외용으로 남긴다", () => {
    const parsed = validateDedupeBody({
      knowledgeType: "topic_pattern",
      items: [{ ...item, id: "k1" }, item],
    });
    expect(parsed.ok && parsed.body.items.map((i) => i.id)).toEqual([
      "k1",
      undefined,
    ]);
  });

  it("RAG 대상이 아닌 knowledgeType 은 거부한다", () => {
    expect(
      validateDedupeBody({
        knowledgeType: "student_record_pattern",
        items: [item],
      }).ok,
    ).toBe(false);
  });

  it("항목이 비었거나 상한을 넘으면 거부한다", () => {
    expect(
      validateDedupeBody({ knowledgeType: "topic_pattern", items: [] }).ok,
    ).toBe(false);
    const many = Array.from({ length: MAX_DEDUPE_ITEMS + 1 }, (_, i) => ({
      ...item,
      rowNo: i + 2,
    }));
    expect(
      validateDedupeBody({ knowledgeType: "topic_pattern", items: many }).ok,
    ).toBe(false);
    expect(MAX_DEDUPE_ITEMS).toBe(200);
  });

  it("rowNo 가 정수가 아니면 거부한다", () => {
    expect(
      validateDedupeBody({
        knowledgeType: "topic_pattern",
        items: [{ ...item, rowNo: "2" }],
      }).ok,
    ).toBe(false);
  });
});

describe("detectKnowledgeDuplicates", () => {
  const base = {
    grade: "고1",
    subject: "과학",
    career_field: "",
    source: "",
    source_link: "",
    keywords: "",
    memo: "",
  };

  it("정확 일치와 근사 일치를 행마다 모으고, 근사에서 정확 일치와 자기 자신은 뺀다", async () => {
    const embed = vi.fn(async (item: { title: string }) => [item.title.length]);
    const searchNear = vi.fn(async () => [
      { id: "e1", title: "AI 윤리", similarity: 1 },
      { id: "self", title: "내 행", similarity: 0.99 },
      { id: "e9", title: "AI 윤리 토론", similarity: 0.96 },
    ]);

    const results = await detectKnowledgeDuplicates(
      {
        knowledgeType: "topic_pattern",
        items: [
          { ...base, rowNo: 2, title: "AI 윤리", content: "핵심 내용" },
          {
            ...base,
            rowNo: 3,
            id: "self",
            title: "내 행",
            content: "내 내용",
          },
        ],
      },
      {
        existing: [
          { id: "e1", title: "AI 윤리", content: "핵심 내용" },
          { id: "self", title: "내 행", content: "내 내용" },
        ],
        embed,
        searchNear,
      },
    );

    expect(searchNear).toHaveBeenCalledWith(
      [expect.any(Number)],
      KNOWLEDGE_NEAR_DUPLICATE_THRESHOLD,
    );
    expect(embed.mock.calls[0]?.[0]).toMatchObject({
      knowledge_type: "topic_pattern",
      title: "AI 윤리",
      grade: "고1",
    });
    expect(results).toEqual([
      {
        rowNo: 2,
        exact: [{ id: "e1", title: "AI 윤리" }],
        near: [
          { id: "self", title: "내 행", similarity: 0.99 },
          { id: "e9", title: "AI 윤리 토론", similarity: 0.96 },
        ],
      },
      {
        rowNo: 3,
        exact: [],
        near: [
          { id: "e1", title: "AI 윤리", similarity: 1 },
          { id: "e9", title: "AI 윤리 토론", similarity: 0.96 },
        ],
      },
    ]);
    expect(KNOWLEDGE_NEAR_DUPLICATE_THRESHOLD).toBe(0.95);
  });
});
