import { describe, expect, test } from "vitest";
import { defaultQ4, middleToNine, toNineGrade } from "./gradeConvert.js";

// q4 ordinals: 16 r6-r9 (1 9등급제, 2 5등급제, 3 성취평가제 중심, 4 잘 모르겠어요)
describe("toNineGrade", () => {
  test("5등급제 1.40 becomes 2.25 (계산 예시 A20, 09 r41)", () => {
    expect(toNineGrade(2, 1.4)).toBe(2.25);
  });

  test("9등급제 needs no conversion (16 r6)", () => {
    expect(toNineGrade(1, 3.27)).toBe(3.27);
  });

  test("성취평가제 average falls in its A to E band (12 r5-r9)", () => {
    expect(toNineGrade(3, 95)).toBe(3.17); // A
    expect(toNineGrade(3, 90)).toBe(3.17); // A lower edge
    expect(toNineGrade(3, 89.9)).toBe(4.39); // B
    expect(toNineGrade(3, 75)).toBe(5.17); // C
    expect(toNineGrade(3, 65)).toBe(5.95); // D
    expect(toNineGrade(3, 59.9)).toBe(7.12); // E, no lower bound
  });

  test("잘 모르겠어요 has no 9-grade value (16 r9)", () => {
    expect(toNineGrade(4, 3.27)).toBeNull();
  });
});

// q1 ordinals (14 r6-r11): 1 중1 or 중2, 2 중3, 3 고1, 4 고2, 5 고3, 6 N수
describe("defaultQ4 (16 r19-r21)", () => {
  test("middle school defaults to 성취평가제 중심", () => {
    expect(defaultQ4(1, "2026-11-09")).toBe(3);
    expect(defaultQ4(2, "2026-11-09")).toBe(3);
  });

  test("high school by entry year, 2025 or later is 5등급제", () => {
    // entry year = school year - grade + 1
    expect(defaultQ4(3, "2026-11-09")).toBe(2); // 고1 -> 2026
    expect(defaultQ4(4, "2026-11-09")).toBe(2); // 고2 -> 2025
    expect(defaultQ4(5, "2026-11-09")).toBe(1); // 고3 -> 2024, 9등급제
  });

  test("N수생 defaults to 9등급제", () => {
    expect(defaultQ4(6, "2026-11-09")).toBe(1);
  });

  test("January and February use the previous school year (judge R13)", () => {
    expect(defaultQ4(4, "2027-02-10")).toBe(2); // 고2 of 2026 -> 2025
    expect(defaultQ4(4, "2027-03-02")).toBe(2); // 고2 of 2027 -> 2026
    expect(defaultQ4(5, "2027-02-10")).toBe(1); // 고3 of 2026 -> 2024
    expect(defaultQ4(5, "2027-03-02")).toBe(2); // 고3 of 2027 -> 2025
  });
});

describe("middleToNine (10_환산_중학교, 0.1 step)", () => {
  test("table rows: 100 is 2.33, 99.9 is 2.35, 26 is 9", () => {
    expect(middleToNine(100)).toBe(2.33);
    expect(middleToNine(99.9)).toBe(2.35);
    expect(middleToNine(85)).toBe(middleToNine(85.0));
    expect(middleToNine(26)).toBe(9);
  });

  test("a score between steps is rounded half up to 0.1 before lookup", () => {
    expect(middleToNine(99.94)).toBe(2.35);
    expect(middleToNine(99.95)).toBe(2.33);
    expect(middleToNine(70.05)).toBe(middleToNine(70.1));
  });

  test("a score outside the table has no 9-grade value (no invented fallback)", () => {
    expect(middleToNine(25.9)).toBeNull();
    expect(middleToNine(0)).toBeNull();
    expect(middleToNine(100.1)).toBeNull();
  });
});
