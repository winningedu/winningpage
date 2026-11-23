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

  test("calc example A26: 11-5 별로 is a one-step item, LEVER_H12_DEEP, task 11/14", () => {
    const page2 = calcRx().page2;
    expect(page2.lever).toBe("LEVER_H12_DEEP");
    expect(page2.weak.map((w) => [w.no, w.area, w.answer, w.target])).toEqual([
      [5, "H12_DEEP", 1, 2],
    ]);
    expect(page2.weak[0]?.link).toMatchObject({
      kind: "task",
      task: { date: "2026-11-14", taskId: "AREA_H12_DEEP_ACT1" },
    });
  });

  test("strengths: answers of 75+ high to low, then item number, PAGE1 4, PAGE2 3", () => {
    const rx = calcRx();
    expect(rx.page1.strong.map((s) => s.no)).toEqual([1, 2, 3, 4]);
    expect(rx.page2.strong.map((s) => s.no)).toEqual([1, 9]);
    const top = buildPrescriptions({
      answers: {
        ...CALC_EXAMPLE,
        q11: {
          ...CALC_EXAMPLE.q11,
          items: [3, 4, 3, 4, 4, 3, 2, 2, 2, 2, 2, 2],
        },
      },
      track: "H12",
      areaScores: CALC_SCORES,
      plan: calcPlan,
    });
    expect(top.page2.strong.map((s) => s.no)).toEqual([2, 4, 5]);
  });

  test("weak sort: lever sources first, then area score, capped at 3; other areas link ACT1", () => {
    const rx = buildPrescriptions({
      answers: {
        ...CALC_EXAMPLE,
        q9: { ...CALC_EXAMPLE.q9, items: Array(15).fill(1) },
      },
      track: "H12",
      areaScores: CALC_SCORES,
      plan: calcPlan,
    });
    expect(rx.page1.weak.map((w) => w.no)).toEqual([9, 5, 1]);
    expect(rx.page1.lever).toBe("LEVER_P1_LOG");
    expect(rx.page1.weak[2]?.link).toEqual({
      kind: "act",
      actId: "AREA_P1_GOAL_ACT1",
    });
  });

  test("H3 track: no q11 lever, 11-11 rises one step (20 B14), 11-1 two", () => {
    const items = Array(12).fill(3);
    items[0] = 0;
    items[10] = 0;
    const rx = buildPrescriptions({
      answers: { ...CALC_EXAMPLE, q1: 5, q11: { ...CALC_EXAMPLE.q11, items } },
      track: "H3",
      areaScores: {
        ...CALC_SCORES,
        H3_GPA: 60,
        H3_CSAT: 60,
        H3_FIT: 60,
        H3_TYPE: 60,
        H3_REC: 60,
        H3_APPLY: 60,
      },
      plan: calcPlan,
    });
    expect(rx.page2.lever).toBeNull();
    expect(rx.page2.weak.map((w) => [w.no, w.answer, w.target])).toEqual([
      [1, 0, 2],
      [11, 0, 1],
    ]);
  });
});
