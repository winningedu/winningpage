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

  test("area tasks: ACTn per column at week start +1, +3, +5 (21 C13-C15)", () => {
    const area = calcPlan().tasks.filter((t) => t.column !== undefined);
    expect(area).toHaveLength(12);
    // 계산 예시 D25, D26: 11/10(화) and 11/14(토)
    expect(area.filter((t) => t.week === 1)).toEqual([
      {
        date: "2026-11-10",
        day: 2,
        week: 1,
        taskId: "AREA_P1_LOG_ACT1",
        doneId: "DONE_P1_LOG_1",
        column: 1,
        area: "P1_LOG",
      },
      {
        date: "2026-11-12",
        day: 4,
        week: 1,
        taskId: "AREA_P1_PLAN_ACT1",
        doneId: "DONE_P1_PLAN_1",
        column: 2,
        area: "P1_PLAN",
      },
      {
        date: "2026-11-14",
        day: 6,
        week: 1,
        taskId: "AREA_H12_DEEP_ACT1",
        doneId: "DONE_H12_DEEP_1",
        column: 3,
        area: "H12_DEEP",
      },
    ]);
    expect(area.filter((t) => t.week === 4).map((t) => t.date)).toEqual([
      "2026-12-01",
      "2026-12-03",
      "2026-12-05",
    ]);
  });

  test("fixed tasks: FIX_START Day 1, FIX_CHECK_n +6, FIX_NEXT Day 28 (21 C16-C19)", () => {
    const fixed = calcPlan()
      .tasks.filter((t) => t.taskId.startsWith("FIX_"))
      .map((t) => [t.taskId, t.date]);
    expect(fixed).toEqual([
      ["FIX_START", "2026-11-09"],
      ["FIX_CHECK_1", "2026-11-15"],
      ["FIX_CHECK_2", "2026-11-22"],
      ["FIX_CHECK_3", "2026-11-29"],
      ["FIX_NEXT", "2026-12-06"],
      ["FIX_CHECK_4", "2026-12-06"],
    ]);
  });

  test("calc example A33: 수행평가 Day 19 adds D-5 and D-1 tasks, 20 tasks in all", () => {
    const plan = calcPlan();
    expect(plan.tasks).toHaveLength(20);
    const perf = { kind: "PERF", date: "2026-11-27" };
    expect(plan.tasks.filter((t) => t.taskId.startsWith("EVT_"))).toEqual([
      {
        date: "2026-11-22",
        day: 14,
        week: 2,
        taskId: "EVT_PERF_PREP",
        event: perf,
      },
      {
        date: "2026-11-26",
        day: 18,
        week: 3,
        taskId: "EVT_PERF_SUBMIT",
        event: perf,
      },
    ]);
  });
});
