// 섹션 엔진 계약: 서버가 검증하는 요청 스키마와 브라우저가 검증하는 응답 스키마.

import { describe, expect, test } from "vitest";
import { zodIssuesToErrors } from "../http/problem.js";
import {
  SECTION_EXPORT_FROM_MAX,
  SECTION_SEARCH_MAX_LENGTH,
  sectionExportQuery,
  sectionExportSchema,
  sectionListQuery,
  sectionListSchema,
  sectionRowSchema,
  sectionValuesBody,
} from "./contract.js";

describe("sectionListQuery", () => {
  test("쿼리스트링 숫자를 받고 page 기본값은 1 이다", () => {
    expect(sectionListQuery.parse({ page: "2", q: "서울" })).toEqual({
      page: 2,
      q: "서울",
    });
    expect(sectionListQuery.parse({})).toEqual({ page: 1 });
  });

  test("page 가 1 보다 작거나 정수가 아니면 거부한다", () => {
    expect(sectionListQuery.safeParse({ page: "0" }).success).toBe(false);
    expect(sectionListQuery.safeParse({ page: "1.5" }).success).toBe(false);
  });

  test("q 는 100자까지만 받는다", () => {
    const q = (length: number) => ({ q: "가".repeat(length) });
    expect(
      sectionListQuery.safeParse(q(SECTION_SEARCH_MAX_LENGTH)).success,
    ).toBe(true);
    expect(
      sectionListQuery.safeParse(q(SECTION_SEARCH_MAX_LENGTH + 1)).success,
    ).toBe(false);
  });
});

describe("sectionExportQuery", () => {
  test("from 기본값은 0 이고 0 부터 1,000,000 까지 받는다", () => {
    expect(sectionExportQuery.parse({})).toEqual({ from: 0 });
    const from = (value: number) => ({ from: String(value) });
    expect(
      sectionExportQuery.safeParse(from(SECTION_EXPORT_FROM_MAX)).success,
    ).toBe(true);
    expect(
      sectionExportQuery.safeParse(from(SECTION_EXPORT_FROM_MAX + 1)).success,
    ).toBe(false);
    expect(sectionExportQuery.safeParse(from(-1)).success).toBe(false);
  });
});

describe("sectionValuesBody", () => {
  test("values 객체를 받는다", () => {
    expect(sectionValuesBody.parse({ values: { a: 1 } })).toEqual({
      values: { a: 1 },
    });
  });

  test.each([{}, { values: [1] }, { values: "x" }, { values: null }])(
    "values 가 없거나 객체가 아니면 values 경로의 한국어 안내로 거부한다: %j",
    (body) => {
      const result = sectionValuesBody.safeParse(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(zodIssuesToErrors(result.error.issues)).toEqual([
          { path: "values", message: "values 객체가 필요합니다." },
        ]);
      }
    },
  );
});

describe("응답 스키마", () => {
  test("목록은 items 와 숫자 total, 내보내기는 숫자나 null 인 next 를 준다", () => {
    expect(
      sectionListSchema.parse({ items: [{ id: "a", x: 1 }], total: 1 }),
    ).toEqual({ items: [{ id: "a", x: 1 }], total: 1 });
    expect(sectionListSchema.safeParse({ items: [], total: "1" }).success).toBe(
      false,
    );
    expect(
      sectionExportSchema.parse({ items: [], next: null }).next,
    ).toBeNull();
    expect(sectionExportSchema.parse({ items: [], next: 1000 }).next).toBe(
      1000,
    );
  });

  test("행은 컬럼 이름이 문자열인 객체다", () => {
    expect(sectionRowSchema.parse({ id: 1, name: "a" })).toEqual({
      id: 1,
      name: "a",
    });
    expect(sectionRowSchema.safeParse([1]).success).toBe(false);
  });
});
