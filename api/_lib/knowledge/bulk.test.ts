import { describe, expect, it } from "vitest";

import { MAX_BULK_ROWS, validateBulkBody } from "./bulk.js";

const ROW = {
  is_active: true,
  grade: "고1",
  subject: "과학",
  career_field: "의학",
  title: "제목",
  content: "내용",
  source: "출처",
  source_link: "https://example.com",
  keywords: "키워드",
  memo: "메모",
};

describe("validateBulkBody", () => {
  it("신규 행에 메뉴 knowledge_type 과 pending 상태를 강제하고 허용 필드만 남긴다", () => {
    const parsed = validateBulkBody({
      knowledgeType: "topic_pattern",
      inserts: [
        {
          ...ROW,
          knowledge_type: "verified_resource",
          embedding: "[1,2]",
          id: "x",
          created_at: "2020-01-01",
        },
      ],
      updates: [],
    });

    expect(parsed).toEqual({
      ok: true,
      body: {
        knowledgeType: "topic_pattern",
        inserts: [
          {
            ...ROW,
            knowledge_type: "topic_pattern",
            embedding_status: "pending",
            embedding_error: null,
          },
        ],
        updates: [],
      },
    });
  });

  it("신규와 수정을 합쳐 상한을 넘으면 거부한다", () => {
    expect(MAX_BULK_ROWS).toBe(500);
    const inserts = Array.from({ length: 300 }, () => ROW);
    const updates = Array.from({ length: 201 }, (_, i) => ({
      ...ROW,
      id: `id-${i}`,
    }));
    expect(
      validateBulkBody({ knowledgeType: "topic_pattern", inserts, updates }).ok,
    ).toBe(false);
  });

  it("반영할 행이 하나도 없으면 거부한다", () => {
    expect(
      validateBulkBody({
        knowledgeType: "topic_pattern",
        inserts: [],
        updates: [],
      }).ok,
    ).toBe(false);
  });

  it("수정 행은 id 를 따로 떼고 같은 규칙으로 패치를 만든다", () => {
    const parsed = validateBulkBody({
      knowledgeType: "verified_resource",
      inserts: [],
      updates: [{ id: "u1", title: "새 제목", knowledge_type: "x" }],
    });
    expect(parsed).toEqual({
      ok: true,
      body: {
        knowledgeType: "verified_resource",
        inserts: [],
        updates: [
          {
            id: "u1",
            patch: {
              title: "새 제목",
              knowledge_type: "verified_resource",
              embedding_status: "pending",
              embedding_error: null,
            },
          },
        ],
      },
    });
  });

  it("테이블 컬럼이 아닌 키는 사유에 키 이름을 담아 거부한다", () => {
    const inserts = validateBulkBody({
      knowledgeType: "topic_pattern",
      inserts: [{ ...ROW, titel: "오타" }],
      updates: [],
    });
    expect(inserts).toEqual({
      ok: false,
      reason: expect.stringContaining("inserts[0]"),
    });
    expect(inserts.ok === false && inserts.reason).toContain("titel");

    const updates = validateBulkBody({
      knowledgeType: "topic_pattern",
      inserts: [],
      updates: [{ id: "u1", rowNo: 3 }],
    });
    expect(updates.ok === false && updates.reason).toContain("updates[0]");
  });

  it("임베딩과 검색 텍스트 같은 실제 컬럼은 거부하지 않고 버린다", () => {
    const parsed = validateBulkBody({
      knowledgeType: "topic_pattern",
      inserts: [],
      updates: [
        {
          id: "u1",
          title: "새 제목",
          embedding: "[1]",
          search_text: "x",
          embedding_error: "e",
          embedded_at: "2026-11-24T00:00:00Z",
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(Object.keys(parsed.body.updates[0]?.patch ?? {}).sort()).toEqual([
        "embedding_error",
        "embedding_status",
        "knowledge_type",
        "title",
      ]);
    }
  });

  it("id 가 없는 수정 행은 거부한다", () => {
    expect(
      validateBulkBody({
        knowledgeType: "topic_pattern",
        inserts: [],
        updates: [{ title: "제목" }],
      }).ok,
    ).toBe(false);
  });

  it("신규 행에 필수값(grade, subject, title, content)이 비면 거부한다", () => {
    expect(
      validateBulkBody({
        knowledgeType: "topic_pattern",
        inserts: [{ ...ROW, content: "  " }],
        updates: [],
      }).ok,
    ).toBe(false);
  });
});
