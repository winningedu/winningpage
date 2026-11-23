import { describe, expect, test } from "vitest";
import { normalizeClassName } from "./className.js";

describe("normalizeClassName", () => {
  test.each([
    ["3", "3"],
    ["03", "3"],
    ["3반", "3"],
    [" 12반 ", "12"],
    ["010", "10"],
  ])("'%s' 은 숫자 '%s' 이다", (raw, want) => {
    expect(normalizeClassName(raw)).toBe(want);
  });

  test.each([
    "0",
    "00반",
    "",
    "반",
    "A",
    "B반",
    "3학년 2반",
    "1-2",
    "3 반",
    "3반반",
    "-3",
  ])("'%s' 은 올바른 반이 아니라 빈 문자열이다", (raw) => {
    expect(normalizeClassName(raw)).toBe("");
  });
});
