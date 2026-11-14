// 학년도 달력 규칙과 명단 올리기 방식(롤오버, 학기 중) 검증.

import { describe, expect, test } from "vitest";
import { calendarSchoolYear, rosterModeOf } from "./schoolYear.js";

describe("calendarSchoolYear", () => {
  test("the school year starts in March (KST)", () => {
    expect(calendarSchoolYear(new Date("2026-03-01T00:00:00+09:00"))).toBe(
      2026,
    );
    expect(calendarSchoolYear(new Date("2026-02-28T23:59:00+09:00"))).toBe(
      2025,
    );
    expect(calendarSchoolYear(new Date("2026-11-13T12:00:00+09:00"))).toBe(
      2026,
    );
  });
});

describe("rosterModeOf", () => {
  const now = new Date("2026-11-13T12:00:00+09:00");

  test("a tenant behind the calendar school year rolls over to the next year", () => {
    expect(rosterModeOf(2025, now)).toEqual({ mode: "rollover", toYear: 2026 });
  });

  test("a tenant two years behind rolls one year at a time", () => {
    expect(rosterModeOf(2024, now)).toEqual({ mode: "rollover", toYear: 2025 });
  });

  test("a tenant already at the calendar school year is mid-year and keeps its year", () => {
    expect(rosterModeOf(2026, now)).toEqual({ mode: "midyear", toYear: 2026 });
  });
});
