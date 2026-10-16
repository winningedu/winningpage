import { describe, expect, it } from "vitest";
import {
  type CitationRow,
  sortCitations,
  toCitationItem,
} from "./citations.js";

function row(o: Partial<CitationRow>): CitationRow {
  return {
    resource_id: "r1",
    title: "자료",
    knowledge_type: "guide",
    is_active: true,
    hit_count: 10,
    cited_count: 4,
    last_hit_at: "2026-10-01T00:00:00Z",
    last_cited_at: "2026-09-30T00:00:00Z",
    ...o,
  };
}

describe("toCitationItem", () => {
  it("camelCase 로 바꾼다", () => {
    expect(toCitationItem(row({}))).toEqual({
      resourceId: "r1",
      title: "자료",
      knowledgeType: "guide",
      isActive: true,
      hitCount: 10,
      citedCount: 4,
      lastHitAt: "2026-10-01T00:00:00Z",
      lastCitedAt: "2026-09-30T00:00:00Z",
    });
  });
});

describe("sortCitations", () => {
  const items = [
    toCitationItem(row({ resource_id: "a", cited_count: 5, hit_count: 9 })),
    toCitationItem(row({ resource_id: "b", cited_count: 0, hit_count: 20 })),
    toCitationItem(row({ resource_id: "c", cited_count: 0, hit_count: 3 })),
    toCitationItem(row({ resource_id: "d", cited_count: 2, hit_count: 7 })),
  ];

  it("least_cited 는 인용 적은 순, 같으면 검색 많이 된 순", () => {
    expect(
      sortCitations(items, "least_cited").map((i) => i.resourceId),
    ).toEqual(["b", "c", "d", "a"]);
  });

  it("most_cited 는 인용 많은 순", () => {
    expect(sortCitations(items, "most_cited").map((i) => i.resourceId)).toEqual(
      ["a", "d", "b", "c"],
    );
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const copy = [...items];
    sortCitations(items, "most_cited");
    expect(items).toEqual(copy);
  });
});
