import { describe, expect, test } from "vitest";
import type { AreaCode, P1Code, P2Code } from "./codes.js";
import { buildPlan } from "./plan.js";
import { buildPrescriptions } from "./prescription.js";
import { CALC_EXAMPLE } from "./testFixtures.js";

// 계산 예시 D3-D9, D18-D23
const CALC_SCORES: Readonly<Partial<Record<AreaCode, number>>> = {
  P1_GOAL: 83,
  P1_PRIO: 83,
  P1_PLAN: 50,
  P1_EXEC: 77,
  P1_LOG: 41,
  P1_PATT: 74,
  P1_ADJ: 65,
  H12_SUBJ: 74,
  H12_PERF: 65,
  H12_DEEP: 26,
  H12_LINK: 65,
  H12_REC: 74,
  H12_STRA: 50,
};
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
const calcPlan = buildPlan({
  diagnosedAt: "2026-11-09",
  page1Order: CALC_P1,
  page2Order: CALC_P2,
  schedule: CALC_EXAMPLE.q13,
  examOps: "OK",
  weekdayLoad: CALC_EXAMPLE.q21.weekday,
});
const calcRx = () =>
  buildPrescriptions({
    answers: CALC_EXAMPLE,
    track: "H12",
    areaScores: CALC_SCORES,
    plan: calcPlan,
  });

describe("buildPrescriptions", () => {
  test("calc example A25: 8-9 별로, LEVER_P1_LOG, target 대체로, task 11/10", () => {
    const page1 = calcRx().page1;
    expect(page1.lever).toBe("LEVER_P1_LOG");
    expect(page1.weak).toHaveLength(1);
    const [weak] = page1.weak;
    expect(weak).toMatchObject({
      question: "q9",
      no: 9,
      area: "P1_LOG",
      answer: 1,
      target: 3,
    });
    expect(weak?.link).toMatchObject({
      kind: "task",
      task: { date: "2026-11-10", taskId: "AREA_P1_LOG_ACT1" },
    });
  });
});
