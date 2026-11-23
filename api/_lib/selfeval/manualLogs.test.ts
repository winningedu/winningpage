import { describe, expect, test } from "vitest";
import { academicYearWindow, isInAcademicYear } from "./manualLogs.js";

describe("academicYearWindow", () => {
  test("학년도는 3월 1일부터 다음 해 2월 말일까지다", () => {
    expect(academicYearWindow(2026)).toEqual({
      start: "2026-03-01",
      end: "2027-02-28",
    });
  });

  test("다음 해가 윤년이면 2월 29일까지다", () => {
    expect(academicYearWindow(2027).end).toBe("2028-02-29");
  });
});

describe("isInAcademicYear", () => {
  test("경계일은 안, 하루 밖은 밖이다", () => {
    expect(isInAcademicYear("2026-03-01", 2026)).toBe(true);
    expect(isInAcademicYear("2027-02-28", 2026)).toBe(true);
    expect(isInAcademicYear("2026-02-28", 2026)).toBe(false);
    expect(isInAcademicYear("2027-03-01", 2026)).toBe(false);
  });
});
