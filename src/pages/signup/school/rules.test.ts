import { describe, expect, it } from "vitest";
import { isValidClassNumber, isValidUsername } from "./rules";

describe("isValidUsername", () => {
  it("영문 소문자와 숫자 4자에서 20자를 받는다", () => {
    expect(isValidUsername("abcd")).toBe(true);
    expect(isValidUsername("a1".repeat(10))).toBe(true);
  });

  it("짧거나 길거나 대문자, @, 공백이 있으면 거절한다", () => {
    expect(isValidUsername("abc")).toBe(false);
    expect(isValidUsername("a".repeat(21))).toBe(false);
    expect(isValidUsername("Abcd")).toBe(false);
    expect(isValidUsername("ab@cd")).toBe(false);
    expect(isValidUsername("ab cd")).toBe(false);
  });
});

describe("isValidClassNumber", () => {
  it("1에서 99까지 정수 문자열을 받는다", () => {
    expect(isValidClassNumber("1")).toBe(true);
    expect(isValidClassNumber("99")).toBe(true);
  });

  it("0, 100, 숫자가 아닌 값은 거절한다", () => {
    expect(isValidClassNumber("0")).toBe(false);
    expect(isValidClassNumber("100")).toBe(false);
    expect(isValidClassNumber("1a")).toBe(false);
    expect(isValidClassNumber("")).toBe(false);
  });
});
