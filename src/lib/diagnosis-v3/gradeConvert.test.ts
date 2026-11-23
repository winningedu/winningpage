import { describe, expect, test } from "vitest";
import { toNineGrade } from "./gradeConvert.js";

// q4 ordinals: 16 r6-r9 (1 9등급제, 2 5등급제, 3 성취평가제 중심, 4 잘 모르겠어요)
describe("toNineGrade", () => {
  test("5등급제 1.40 becomes 2.25 (계산 예시 A20, 09 r41)", () => {
    expect(toNineGrade(2, 1.4)).toBe(2.25);
  });

  test("9등급제 needs no conversion (16 r6)", () => {
    expect(toNineGrade(1, 3.27)).toBe(3.27);
  });

  test("잘 모르겠어요 has no 9-grade value (16 r9)", () => {
    expect(toNineGrade(4, 3.27)).toBeNull();
  });
});
