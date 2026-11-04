import { beforeEach, describe, expect, it, vi } from "vitest";

const result = vi.fn();
const calls: Array<[string, ...unknown[]]> = [];

vi.mock("@/lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "order"]) {
    chain[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return name === "order" &&
        calls.filter((c) => c[0] === "order").length >= 2
        ? result()
        : chain;
    };
  }
  return {
    supabase: {
      from: (table: string) => {
        calls.push(["from", table]);
        return chain;
      },
    },
  };
});

import {
  ALL_CATEGORY,
  fetchColumnCategories,
  getCategoryLabel,
} from "./columnData";

describe("getCategoryLabel", () => {
  it("목록에 있는 category 는 그대로 돌려준다", () => {
    expect(getCategoryLabel({ category: "교육청소식" }, ["교육청소식"])).toBe(
      "교육청소식",
    );
  });

  it("목록에 없는 category 는 전체로 취급한다", () => {
    expect(getCategoryLabel({ category: "삭제된 칩" }, ["교육청소식"])).toBe(
      ALL_CATEGORY,
    );
  });
});

describe("fetchColumnCategories", () => {
  beforeEach(() => {
    result.mockReset();
    calls.length = 0;
  });

  it("활성 행을 sort_order, label 순으로 조회해 label 배열로 돌려준다", async () => {
    result.mockReturnValue({
      data: [{ label: "A" }, { label: "B" }],
      error: null,
    });
    expect(await fetchColumnCategories()).toEqual(["A", "B"]);
    expect(calls).toContainEqual(["from", "column_categories"]);
    expect(calls).toContainEqual(["eq", "is_active", true]);
    expect(calls).toContainEqual(["order", "sort_order", { ascending: true }]);
    expect(calls).toContainEqual(["order", "label", { ascending: true }]);
  });

  it("조회가 실패하면 빈 배열로 대체한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    result.mockReturnValue({ data: null, error: new Error("boom") });
    expect(await fetchColumnCategories()).toEqual([]);
  });
});
