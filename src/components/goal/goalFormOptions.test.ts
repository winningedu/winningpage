import { describe, expect, test } from "vitest";
import { pickWeekdayDates } from "./goalFormOptions";

const WEEK = [
  "2026-10-26",
  "2026-10-27",
  "2026-10-28",
  "2026-10-29",
  "2026-10-30",
  "2026-10-31",
  "2026-11-01",
];

describe("pickWeekdayDates", () => {
  test("월 수 금을 고르면 그 3일만 돌려준다", () => {
    expect(pickWeekdayDates(WEEK, [0, 2, 4])).toEqual([
      "2026-10-26",
      "2026-10-28",
      "2026-10-30",
    ]);
  });

  test("월 경계를 넘는 주에서도 주 안의 날짜만 돌려준다", () => {
    expect(pickWeekdayDates(WEEK, [5, 6])).toEqual([
      "2026-10-31",
      "2026-11-01",
    ]);
  });

  test("선택이 없으면 빈 배열이다", () => {
    expect(pickWeekdayDates(WEEK, [])).toEqual([]);
  });

  test("선택 순서와 무관하게 주 순서로 돌려준다", () => {
    expect(pickWeekdayDates(WEEK, [4, 0])).toEqual([
      "2026-10-26",
      "2026-10-30",
    ]);
  });
});
