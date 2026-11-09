// 특이학생 감지 규칙(사 #147, 결정 106 6번). 기준값은 기관 값이 없으면 기본값 40%, 7일, 14일이다.

import { describe, expect, test } from "vitest";
import { resolveThresholds, specialReasonsOf } from "./special.js";

const T = { execRatePct: 40, inactiveDays: 7, feedbackWaitDays: 14 };
const none = {
  weeklyRate: null,
  urgency: null,
  lastSeenDays: null,
  feedbackWaitingDays: null,
  flagged: false,
};

describe("resolveThresholds", () => {
  test("null tenant columns resolve to the defaults 40, 7, 14", () => {
    expect(
      resolveThresholds({
        special_exec_rate_pct: null,
        special_inactive_days: null,
        special_feedback_wait_days: null,
      }),
    ).toEqual(T);
    expect(resolveThresholds(null)).toEqual(T);
  });

  test("tenant values override the defaults", () => {
    expect(
      resolveThresholds({
        special_exec_rate_pct: 50,
        special_inactive_days: 3,
        special_feedback_wait_days: 5,
      }),
    ).toEqual({ execRatePct: 50, inactiveDays: 3, feedbackWaitDays: 5 });
  });
});

describe("specialReasonsOf low_rate", () => {
  test("a weekly rate below the threshold fires, the threshold itself and an unknown rate do not", () => {
    expect(specialReasonsOf({ ...none, weeklyRate: 39 }, T)).toEqual([
      "low_rate",
    ]);
    expect(specialReasonsOf({ ...none, weeklyRate: 40 }, T)).toEqual([]);
    expect(specialReasonsOf({ ...none, weeklyRate: null }, T)).toEqual([]);
    expect(
      specialReasonsOf({ ...none, weeklyRate: 45 }, { ...T, execRatePct: 50 }),
    ).toEqual(["low_rate"]);
  });
});
