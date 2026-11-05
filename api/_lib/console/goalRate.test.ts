// 주간 목표시간 달성율 규칙 검증(교 #5). 대시보드와 학생 관리가 같은 값을 내도록 이 모듈 하나만 쓴다.

import { describe, expect, test } from "vitest";
import {
  GOAL_RATE_HIGH_FROM,
  GOAL_RATE_LOW_BELOW,
  rateBucket,
  weeklyDates,
  weeklyRate,
} from "./goalRate.js";

// 2026-11-02 는 월요일, 2026-11-08 은 일요일이다.
const day = (record_date: string, study_hours: number, target: number) => ({
  record_date,
  study_hours,
  target_ideal_hours: target,
});

describe("weeklyRate", () => {
  test("study hours on target days plus Sunday over the sum of ideal targets", () => {
    const rate = weeklyRate([
      day("2026-11-02", 5, 5),
      day("2026-11-03", 2.5, 5),
      day("2026-11-04", 6, 5),
      day("2026-11-05", 0, 5),
      day("2026-11-06", 3, 5),
      day("2026-11-07", 5, 5),
      day("2026-11-08", 3, 0),
    ]);

    expect(rate).toBeCloseTo(((21.5 + 3) / 30) * 100, 10);
  });

  test("a day without a target adds neither study hours nor target, except Sunday study hours", () => {
    expect(weeklyRate([day("2026-11-02", 4, 4), day("2026-11-03", 9, 0)])).toBe(
      100,
    );
  });

  test("no target day means 0, and the result is not rounded or capped", () => {
    expect(weeklyRate([])).toBe(0);
    expect(weeklyRate([day("2026-11-08", 3, 0)])).toBe(0);
    expect(weeklyRate([day("2026-11-02", 7.2, 6)])).toBeCloseTo(120, 10);
  });
});

describe("rateBucket", () => {
  test("rounds first, then under 40 is low, 40 to 69 mid, 70 and over high", () => {
    expect(GOAL_RATE_LOW_BELOW).toBe(40);
    expect(GOAL_RATE_HIGH_FROM).toBe(70);
    expect(rateBucket(39.4)).toBe("low");
    expect(rateBucket(39.5)).toBe("mid");
    expect(rateBucket(69.4)).toBe("mid");
    expect(rateBucket(69.5)).toBe("high");
    expect(rateBucket(120)).toBe("high");
  });
});

describe("weeklyDates", () => {
  test("lists this week's Monday through today", () => {
    expect(weeklyDates("2026-11-05")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
    ]);
    expect(weeklyDates("2026-11-02")).toEqual(["2026-11-02"]);
    expect(weeklyDates("2026-11-08")).toHaveLength(7);
  });
});
