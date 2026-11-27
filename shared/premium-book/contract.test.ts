// 프리미엄 책자 계약: 서버가 검증하는 요청 스키마의 경계 값.

import { describe, expect, test } from "vitest";
import {
  applyBody,
  PREMIUM_BOOK_MAX_PAGES,
  pageBody,
  pageIdParams,
} from "./contract.js";

describe("pageBody", () => {
  test("sort_order 정수와 image_url 두 컬럼만 받는다", () => {
    expect(pageBody.safeParse({ sort_order: 1, image_url: "a" }).success).toBe(
      true,
    );
    expect(
      pageBody.safeParse({ sort_order: 1.5, image_url: "a" }).success,
    ).toBe(false);
    expect(
      pageBody.safeParse({ sort_order: 1, image_url: "a", id: 3 }).success,
    ).toBe(false);
    expect(
      pageBody.safeParse({ sort_order: 1, image_url: "x".repeat(2049) })
        .success,
    ).toBe(false);
  });
});

describe("pageIdParams", () => {
  test("양의 정수만 받는다", () => {
    expect(pageIdParams.parse({ id: "7" })).toEqual({ id: 7 });
    for (const id of ["abc", "0", "-1", "1.5"]) {
      expect(pageIdParams.safeParse({ id }).success).toBe(false);
    }
  });
});

describe("applyBody", () => {
  test("pages 는 1장 이상 상한 이하다", () => {
    const body = (n: number) => ({
      pdf: "p",
      pages: Array.from({ length: n }, () => "x"),
    });
    expect(applyBody.safeParse(body(1)).success).toBe(true);
    expect(applyBody.safeParse(body(PREMIUM_BOOK_MAX_PAGES)).success).toBe(
      true,
    );
    expect(applyBody.safeParse(body(0)).success).toBe(false);
    expect(applyBody.safeParse(body(PREMIUM_BOOK_MAX_PAGES + 1)).success).toBe(
      false,
    );
  });
});
