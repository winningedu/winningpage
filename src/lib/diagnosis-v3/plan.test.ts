import { describe, expect, test } from "vitest";
import type { P1Code, P2Code } from "./codes.js";
import { buildPlan } from "./plan.js";
import { CALC_EXAMPLE } from "./testFixtures.js";

// 계산 예시 A13 and A18-A23: page orders low to high after the 23 tie rule.
const CALC_P1: readonly P1Code[] = [
  "P1_LOG",
  "P1_PLAN",
  "P1_ADJ",
  "P1_PATT",
  "P1_EXEC",
  "P1_GOAL",
  "P1_PRIO",
];
const CALC_P2: readonly P2Code[] = [
  "H12_DEEP",
  "H12_STRA",
  "H12_PERF",
  "H12_LINK",
  "H12_SUBJ",
  "H12_REC",
];

const calcPlan = () =>
  buildPlan({
    diagnosedAt: "2026-11-09",
    page1Order: CALC_P1,
    page2Order: CALC_P2,
    schedule: CALC_EXAMPLE.q13,
    examOps: "OK",
    weekdayLoad: CALC_EXAMPLE.q21.weekday,
  });

describe("buildPlan", () => {
  test("calc example A33: columns are 활동 기록, 계획 수립, 탐구 심화", () => {
    expect(calcPlan().columns).toEqual(["P1_LOG", "P1_PLAN", "H12_DEEP"]);
  });
});
