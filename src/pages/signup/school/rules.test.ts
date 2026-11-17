import { describe, expect, it } from "vitest";
import { isValidClassNumber, isValidEmail } from "./rules";

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

describe("isValidEmail", () => {
  it("골뱅이와 점이 있는 주소만 받는다", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.co")).toBe(false);
  });
});
