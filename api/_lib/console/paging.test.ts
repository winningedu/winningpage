// 콘솔 목록 페이지 나누기와 전체 읽기 규칙 검증. Supabase 는 한 번에 1000행까지만 주므로 끝까지 읽어야 한다.

import { describe, expect, test } from "vitest";
import {
  fetchAllRows,
  PAGE_SIZE_MAX,
  paginate,
  parsePageQuery,
} from "./paging.js";

describe("parsePageQuery", () => {
  test("defaults to page 1 and 50 rows", () => {
    expect(parsePageQuery({})).toEqual({ page: 1, pageSize: 50 });
  });

  test("reads page and pageSize and caps pageSize at 50", () => {
    expect(parsePageQuery({ page: "3", pageSize: "20" })).toEqual({
      page: 3,
      pageSize: 20,
    });
    expect(parsePageQuery({ pageSize: "500" })).toEqual({
      page: 1,
      pageSize: PAGE_SIZE_MAX,
    });
  });

  test.each([
    ["zero", { page: "0" }],
    ["negative", { page: "-1" }],
    ["fraction", { page: "1.5" }],
    ["text", { page: "abc" }],
    ["zero size", { pageSize: "0" }],
  ])("a %s value is rejected", (_n, query) => {
    expect(parsePageQuery(query)).toBeNull();
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 120 }, (_, i) => i + 1);

  test("returns the slice with total and pageCount", () => {
    const result = paginate(rows, { page: 2, pageSize: 50 });
    expect(result.total).toBe(120);
    expect(result.page).toBe(2);
    expect(result.pageCount).toBe(3);
    expect(result.items[0]).toBe(51);
    expect(result.items).toHaveLength(50);
  });

  test("a page past the end is empty and an empty list has zero pages", () => {
    expect(paginate(rows, { page: 9, pageSize: 50 }).items).toEqual([]);
    expect(paginate([], { page: 1, pageSize: 50 })).toEqual({
      total: 0,
      page: 1,
      pageCount: 0,
      items: [],
    });
  });
});

describe("fetchAllRows", () => {
  test("keeps asking until a page comes back short", async () => {
    const all = Array.from({ length: 2300 }, (_, i) => i);
    const calls: [number, number][] = [];
    const result = await fetchAllRows(async (from, to) => {
      calls.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(result).toEqual(all);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  test("a failed page throws instead of returning partial rows", async () => {
    await expect(
      fetchAllRows(async () => ({ data: null, error: { message: "boom" } })),
    ).rejects.toThrow("console read failed");
  });
});
