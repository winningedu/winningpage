import { describe, expect, it } from "vitest";

import {
  buildBulkRequests,
  buildDedupeItems,
  chunk,
  defaultSelection,
} from "./knowledgeBulkPlan";

const row = (rowNo: number, id: string | null = null) => ({
  rowNo,
  id,
  values: {
    title: `제목${rowNo}`,
    content: "내용",
    knowledge_type: "topic_pattern",
  },
  hash: "h",
});

describe("defaultSelection", () => {
  it("정확 일치 행은 기본 제외하고 근사 행과 깨끗한 행은 기본 포함한다", () => {
    const selected = defaultSelection(
      {
        inserts: [row(2), row(3), row(4)],
        updates: [row(5, "k1")],
        errors: [],
      },
      [
        { rowNo: 2, exact: [{ id: "e1", title: "제목2" }], near: [] },
        {
          rowNo: 3,
          exact: [],
          near: [{ id: "e2", title: "비슷", similarity: 0.97 }],
        },
        { rowNo: 4, exact: [], near: [] },
        { rowNo: 5, exact: [], near: [] },
      ],
    );
    expect([...selected].sort()).toEqual([3, 4, 5]);
  });
});

describe("buildBulkRequests", () => {
  it("체크한 행만 신규와 수정으로 나눠 요청 본문을 만든다", () => {
    const requests = buildBulkRequests(
      "topic_pattern",
      { inserts: [row(2), row(3)], updates: [row(5, "k1")], errors: [] },
      new Set([3, 5]),
      500,
    );
    expect(requests).toEqual([
      {
        knowledgeType: "topic_pattern",
        inserts: [row(3).values],
        updates: [{ ...row(5).values, id: "k1" }],
      },
    ]);
  });

  it("상한을 넘으면 여러 요청으로 나눈다", () => {
    const inserts = Array.from({ length: 5 }, (_, i) => row(i + 2));
    const requests = buildBulkRequests(
      "topic_pattern",
      { inserts, updates: [], errors: [] },
      new Set(inserts.map((r) => r.rowNo)),
      2,
    );
    expect(requests.map((r) => r.inserts.length)).toEqual([2, 2, 1]);
  });

  it("체크한 행이 없으면 요청도 없다", () => {
    expect(
      buildBulkRequests(
        "topic_pattern",
        { inserts: [row(2)], updates: [], errors: [] },
        new Set(),
        500,
      ),
    ).toEqual([]);
  });
});

describe("chunk", () => {
  it("배열을 크기대로 자른다", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("buildDedupeItems", () => {
  it("제목과 내용이 있는 행만 검사 항목으로 만들고 빈 텍스트 필드는 빈 문자열로 채운다", () => {
    const partial = {
      rowNo: 6,
      id: "k2",
      values: { memo: "메모만" },
      hash: "h",
    };
    const items = buildDedupeItems({
      inserts: [row(2)],
      updates: [row(5, "k1"), partial],
      errors: [],
    });
    expect(items).toEqual([
      {
        rowNo: 2,
        title: "제목2",
        content: "내용",
        grade: "",
        subject: "",
        career_field: "",
        source: "",
        source_link: "",
        keywords: "",
        memo: "",
      },
      expect.objectContaining({ rowNo: 5, id: "k1", title: "제목5" }),
    ]);
  });
});
