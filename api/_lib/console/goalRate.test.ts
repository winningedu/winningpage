// 주간 목표시간 달성율과 최소 목표 충족일 규칙 검증(교 #5, #6, #68, #82).
// 이번 주 = 어제까지 7일(오늘 제외), 지난주 = 그 전 7일. 이 모듈 하나를 모든 콘솔 화면이 쓴다.

import { describe, expect, test } from "vitest";
import {
  buildGoalDays,
  GOAL_RATE_HIGH_FROM,
  GOAL_RATE_LOW_BELOW,
  goalWeeks,
  rateBucket,
  summarizeGoalWeek,
  weekWindows,
} from "./goalRate.js";

// 2026-11-05 는 목요일. 어제(11-04)까지 7일은 10-29(목)부터 11-04(수)다.
const TODAY = "2026-11-05";

const record = (
  record_date: string,
  study_hours: number,
  ideal: number,
  min: number,
) => ({
  record_date,
  study_hours,
  target_ideal_hours: ideal,
  target_min_hours: min,
});

describe("weekWindows", () => {
  test("this week is the 7 days ending yesterday, previous week the 7 days before", () => {
    const { thisWeek, previousWeek } = weekWindows(TODAY);

    expect(thisWeek[0]).toBe("2026-10-29");
    expect(thisWeek[6]).toBe("2026-11-04");
    expect(thisWeek).toHaveLength(7);
    expect(previousWeek[0]).toBe("2026-10-22");
    expect(previousWeek[6]).toBe("2026-10-28");
  });

  test("a window always holds six Monday to Saturday days and one Sunday", () => {
    for (const today of ["2026-11-02", "2026-11-05", "2026-11-08"]) {
      const days = buildGoalDays(weekWindows(today).thisWeek, [], null);
      expect(days.filter((d) => d.weekday === "sun")).toHaveLength(1);
      expect(days.filter((d) => d.weekday !== "sun")).toHaveLength(6);
    }
  });
});

describe("summarizeGoalWeek", () => {
  const schedule = Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map(
      (d) => [d, { ideal: 5, min: 3 }],
    ),
  );
  // 2026-11-09(월) 기준 어제까지 7일 = 11-02(월) ~ 11-08(일)
  const dates = weekWindows("2026-11-09").thisWeek;

  test("rate is study hours on target days plus Sunday over the ideal target sum, unrounded and uncapped", () => {
    const days = buildGoalDays(
      dates,
      [
        record("2026-11-02", 5, 5, 3),
        record("2026-11-03", 2.5, 5, 3),
        record("2026-11-04", 6, 5, 3),
        record("2026-11-05", 0, 5, 3),
        record("2026-11-06", 3, 5, 3),
        record("2026-11-07", 5, 5, 3),
        record("2026-11-08", 3, 0, 0),
      ],
      null,
    );

    const week = summarizeGoalWeek(days);

    expect(week.achievementPct).toBeCloseTo(((21.5 + 3) / 30) * 100, 10);
    expect(week.setDays).toBe(6);
    expect(
      summarizeGoalWeek(
        buildGoalDays(dates, [record("2026-11-02", 36, 5, 3)], schedule),
      ).achievementPct,
    ).toBeGreaterThan(100);
  });

  test("a target day with no record counts as 0 hours, with the target taken from the schedule", () => {
    const week = summarizeGoalWeek(
      buildGoalDays(dates, [record("2026-11-02", 5, 5, 3)], schedule),
    );

    expect(week.setDays).toBe(6);
    expect(week.achievementPct).toBeCloseTo((5 / 30) * 100, 10);
  });

  test("met days are target days with actual at or above the minimum, Sunday never counts", () => {
    const week = summarizeGoalWeek(
      buildGoalDays(
        dates,
        [
          record("2026-11-02", 3, 5, 3),
          record("2026-11-03", 2.9, 5, 3),
          record("2026-11-04", 9, 5, 3),
          record("2026-11-08", 9, 0, 0),
        ],
        schedule,
      ),
    );

    expect(week.metDays).toBe(2);
    expect(week.setDays).toBe(6);
  });

  test("a day without a target is left out of both sums, only Sunday hours are added", () => {
    const week = summarizeGoalWeek(
      buildGoalDays(
        dates,
        [
          record("2026-11-02", 4, 4, 2),
          record("2026-11-03", 9, 0, 0),
          record("2026-11-08", 2, 0, 0),
        ],
        null,
      ),
    );

    expect(week.setDays).toBe(1);
    expect(week.achievementPct).toBe(150);
  });

  test("no target day gives no rate", () => {
    expect(summarizeGoalWeek(buildGoalDays(dates, [], null))).toEqual({
      setDays: 0,
      metDays: 0,
      achievementPct: null,
    });
  });
});

describe("goalWeeks", () => {
  test("returns this week and the previous week summaries from one set of records", () => {
    const schedule = { monday: { ideal: 4, min: 2 } };
    const { thisWeek, previousWeek } = goalWeeks(
      TODAY,
      [record("2026-11-02", 4, 4, 2), record("2026-10-26", 2, 4, 2)],
      schedule,
    );

    expect(thisWeek.achievementPct).toBe(100);
    expect(thisWeek.metDays).toBe(1);
    expect(previousWeek.achievementPct).toBe(50);
    expect(previousWeek.metDays).toBe(1);
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
