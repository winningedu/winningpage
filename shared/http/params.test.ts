// 경로 구간 id 스키마. 경로 값은 늘 문자열로 온다.

import { describe, expect, test } from "vitest";
import { positiveIntId, uuidId } from "./params.js";

describe("positiveIntId", () => {
  test("양의 정수 글자를 숫자로 바꾼다", () => {
    expect(positiveIntId.parse("42")).toBe(42);
  });

  test.each(["0", "05", "-1", "1.5", "abc", ""])("%s 는 거부한다", (value) => {
    expect(positiveIntId.safeParse(value).success).toBe(false);
  });

  test("안전 정수를 넘으면 거부한다", () => {
    expect(positiveIntId.safeParse("9007199254740993").success).toBe(false);
  });
});

describe("uuidId", () => {
  test("uuid 만 받는다", () => {
    expect(
      uuidId.safeParse("7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11").success,
    ).toBe(true);
    expect(uuidId.safeParse("grants").success).toBe(false);
  });
});
