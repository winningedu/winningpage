import { describe, expect, test } from "vitest";
import { normalizeClassName } from "./className.js";

describe("normalizeClassName", () => {
  test.each([
    ["01반", "1"],
    ["01", "1"],
    ["1", "1"],
    ["1반", "1"],
    [" 1 반", "1"],
    ["10반", "10"],
    ["010", "10"],
    ["A", "A"],
    ["A반", "A"],
    ["B 반", "B"],
    ["A01", "A01"],
    ["a 01", "a 01"],
    ["starter", "starter"],
    ["3학년 2반", "3학년 2"],
    ["3반반", "3반"],
    ["1-2", "1-2"],
  ])("'%s' 은 '%s' 이다", (raw, want) => {
    expect(normalizeClassName(raw)).toBe(want);
  });

  test.each(["", "반", "0", "00", "00반", "  ", " 0 반"])(
    "'%s' 은 올바른 반이 아니라 빈 문자열이다",
    (raw) => {
      expect(normalizeClassName(raw)).toBe("");
    },
  );
});
