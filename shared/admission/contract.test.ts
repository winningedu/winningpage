// 입시 관리 계약: 서버가 검증하는 요청 스키마의 경계 값.

import { describe, expect, test } from "vitest";
import {
  activeYearBody,
  RESULTS_BULK_MAX_ITEMS,
  resultsBulkBody,
  resultsRowsQuery,
} from "./contract.js";

describe("activeYearBody", () => {
  test("2000~2100 사이 정수만 받는다", () => {
    expect(activeYearBody.safeParse({ year: 2000 }).success).toBe(true);
    expect(activeYearBody.safeParse({ year: 2100 }).success).toBe(true);
    expect(activeYearBody.safeParse({ year: 1999 }).success).toBe(false);
    expect(activeYearBody.safeParse({ year: 2101 }).success).toBe(false);
    expect(activeYearBody.safeParse({ year: 2026.5 }).success).toBe(false);
    expect(activeYearBody.safeParse({ year: "2026" }).success).toBe(false);
  });
});

describe("resultsRowsQuery", () => {
  test("offset 은 0 이상 정수로 바꾸고 기본 0, fields 는 all 또는 id", () => {
    expect(resultsRowsQuery.parse({ fields: "id" })).toEqual({
      offset: 0,
      fields: "id",
    });
    expect(resultsRowsQuery.parse({ offset: "1000", fields: "all" })).toEqual({
      offset: 1000,
      fields: "all",
    });
    expect(
      resultsRowsQuery.safeParse({ offset: "-1", fields: "id" }).success,
    ).toBe(false);
    expect(resultsRowsQuery.safeParse({ fields: "x" }).success).toBe(false);
  });
});

describe("resultsBulkBody", () => {
  test("items 는 상한 행 수까지 받는다", () => {
    const items = (n: number) => ({
      items: Array.from({ length: n }, () => ({})),
    });
    expect(
      resultsBulkBody.safeParse(items(RESULTS_BULK_MAX_ITEMS)).success,
    ).toBe(true);
    expect(
      resultsBulkBody.safeParse(items(RESULTS_BULK_MAX_ITEMS + 1)).success,
    ).toBe(false);
  });
});
