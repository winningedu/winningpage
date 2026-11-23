import { describe, expect, test } from "vitest";
import type { P1Code, P2Code } from "./codes.js";
import { buildPlan, buildPlannerPages, type PlanInput } from "./plan.js";
import { COPY_TEXT } from "./source/copyText.js";
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

const calcInput = (): PlanInput => ({
  diagnosedAt: "2026-11-09",
  page1Order: CALC_P1,
  page2Order: CALC_P2,
  schedule: CALC_EXAMPLE.q13,
  examOps: "OK",
  weekdayLoad: CALC_EXAMPLE.q21.weekday,
});
const calcPlan = () => buildPlan(calcInput());

// PDF student (고2, diagnosed 2026-11-10): p2 stage scores, p7 lowest area,
// p12 columns 우선순위, 학습 수행, 탐구 심화; 정기고사 12/7; p3 시험 운영 보완; 60분.
const pdfInput = (): PlanInput => ({
  diagnosedAt: "2026-11-10",
  page1Order: [
    "P1_PRIO",
    "P1_EXEC",
    "P1_LOG",
    "P1_PLAN",
    "P1_GOAL",
    "P1_PATT",
    "P1_ADJ",
  ],
  page2Order: [
    "H12_DEEP",
    "H12_STRA",
    "H12_PERF",
    "H12_LINK",
    "H12_SUBJ",
    "H12_REC",
  ],
  schedule: [{ kind: "EXAM", date: "2026-12-07" }],
  examOps: "RISK",
  weekdayLoad: 5,
});

describe("buildPlannerPages (22 r109-r113)", () => {
  const pages = () => buildPlannerPages(buildPlan(pdfInput()));

  test("PDF p12 head: WEEK_GOAL_1, plan.week_badge, plan.redx", () => {
    const [week1] = pages();
    expect(week1?.week).toBe(1);
    expect(week1?.goal).toBe(COPY_TEXT.WEEK_GOAL_1);
    expect(week1?.badge).toBe("1 / 4주 \u00b7 Day 1\u20137");
    expect(week1?.redx).toBe("4주 학습진단 \u00b7 재진단 12/8(화)");
  });

  test("PDF p12, p15 done criteria: record 5 days, plan.rate, first column done", () => {
    const all = pages();
    expect(all[0]?.done).toEqual([
      "주 7일 중 5일 이상",
      "실행률 50% 이상",
      "중요\u00b7급함 4칸 표 1장",
    ]);
    expect(all[3]?.done).toEqual([
      "주 7일 중 5일 이상",
      "실행률 70% 이상",
      "다음 주 우선순위 3개",
    ]);
  });
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

  test("calc example A33: 수행평가 week 3 is reduced, column 3 done becomes DONE_REDUCED", () => {
    const plan = calcPlan();
    expect(plan.reducedWeeks).toEqual([3]);
    const column3 = plan.tasks.filter((t) => t.column === 3);
    expect(column3.map((t) => t.doneId)).toEqual([
      "DONE_H12_DEEP_1",
      "DONE_H12_DEEP_2",
      "DONE_REDUCED",
      "DONE_H12_DEEP_4",
    ]);
  });

  test("calc example A33: 기말 Day 32 is an after-note only, re-diagnosis 12/7(월)", () => {
    const plan = calcPlan();
    expect(plan.afterEvents).toEqual([{ kind: "EXAM", date: "2026-12-10" }]);
    expect(plan.tasks.some((t) => t.event?.date === "2026-12-10")).toBe(false);
    expect(plan.redxDate).toBe("2026-12-07");
  });

  test("min load is the q21 weekday MINLOAD code (14 r144-r148)", () => {
    expect(calcPlan().minLoad).toBe(30);
    expect(buildPlan({ ...calcInput(), weekdayLoad: 5 }).minLoad).toBe(60);
  });

  test("PDF p14: RISK puts EXAMOPS_TASK_EXAM at the first exam D-7 (21 C37)", () => {
    const examops = buildPlan(pdfInput()).tasks.filter((t) =>
      t.taskId.startsWith("EXAMOPS_"),
    );
    expect(examops).toEqual([
      {
        date: "2026-11-30",
        day: 21,
        week: 3,
        taskId: "EXAMOPS_TASK_EXAM",
        event: { kind: "EXAM", date: "2026-12-07" },
      },
    ]);
  });

  const examOpsOf = (schedule: PlanInput["schedule"]) =>
    buildPlan({ ...pdfInput(), schedule })
      .tasks.filter((t) => t.taskId.startsWith("EXAMOPS_"))
      .map((t) => [t.taskId, t.day]);

  test("RISK without an exam from Day 4 puts EXAMOPS_TASK on Day 13", () => {
    expect(examOpsOf("NONE")).toEqual([["EXAMOPS_TASK", 13]]);
    // exam on Day 3 is less than 3 days after diagnosis
    expect(examOpsOf([{ kind: "EXAM", date: "2026-11-12" }])).toEqual([
      ["EXAMOPS_TASK", 13],
    ]);
  });

  test("exam D-7 before the day after diagnosis moves to Day 2 (spec row 77)", () => {
    expect(examOpsOf([{ kind: "EXAM", date: "2026-11-15" }])).toEqual([
      ["EXAMOPS_TASK_EXAM", 2],
    ]);
  });

  test("spec row 131: event the day after diagnosis drops past tasks, still reduces", () => {
    const plan = buildPlan({
      ...pdfInput(),
      examOps: "OK",
      schedule: [{ kind: "PERF", date: "2026-11-11", subject: "국어" }],
    });
    expect(
      plan.tasks
        .filter((t) => t.taskId.startsWith("EVT_"))
        .map((t) => [t.taskId, t.day]),
    ).toEqual([["EVT_PERF_SUBMIT", 1]]);
    expect(plan.reducedWeeks).toEqual([1]);
  });

  test("spec row 132: Day 29..42 event makes no task and no reduced week", () => {
    const plan = buildPlan({
      ...pdfInput(),
      schedule: [{ kind: "APPLY", date: "2026-12-21" }],
    });
    expect(plan.afterEvents).toEqual([{ kind: "APPLY", date: "2026-12-21" }]);
    expect(plan.reducedWeeks).toEqual([]);
    expect(plan.tasks.some((t) => t.event !== undefined)).toBe(false);
  });

  test("PDF p12-p15: dates and tasks of the PDF student", () => {
    const plan = buildPlan(pdfInput());
    expect(plan.columns).toEqual(["P1_PRIO", "P1_EXEC", "H12_DEEP"]);
    expect(plan.reducedWeeks).toEqual([4]);
    expect(plan.redxDate).toBe("2026-12-08");
    expect(plan.minLoad).toBe(60);
    expect(plan.tasks.map((t) => [t.date, t.taskId, t.doneId])).toEqual([
      ["2026-11-10", "FIX_START", undefined],
      ["2026-11-11", "AREA_P1_PRIO_ACT1", "DONE_P1_PRIO_1"],
      ["2026-11-13", "AREA_P1_EXEC_ACT1", "DONE_P1_EXEC_1"],
      ["2026-11-15", "AREA_H12_DEEP_ACT1", "DONE_H12_DEEP_1"],
      ["2026-11-16", "FIX_CHECK_1", undefined],
      ["2026-11-18", "AREA_P1_PRIO_ACT2", "DONE_P1_PRIO_2"],
      ["2026-11-20", "AREA_P1_EXEC_ACT2", "DONE_P1_EXEC_2"],
      ["2026-11-22", "AREA_H12_DEEP_ACT2", "DONE_H12_DEEP_2"],
      ["2026-11-23", "FIX_CHECK_2", undefined],
      ["2026-11-25", "AREA_P1_PRIO_ACT3", "DONE_P1_PRIO_3"],
      ["2026-11-27", "AREA_P1_EXEC_ACT3", "DONE_P1_EXEC_3"],
      ["2026-11-29", "AREA_H12_DEEP_ACT3", "DONE_H12_DEEP_3"],
      ["2026-11-30", "EXAMOPS_TASK_EXAM", undefined],
      ["2026-11-30", "FIX_CHECK_3", undefined],
      ["2026-12-02", "AREA_P1_PRIO_ACT4", "DONE_P1_PRIO_4"],
      ["2026-12-04", "AREA_P1_EXEC_ACT4", "DONE_P1_EXEC_4"],
      ["2026-12-04", "EVT_EXAM", undefined],
      ["2026-12-06", "AREA_H12_DEEP_ACT4", "DONE_REDUCED"],
      ["2026-12-07", "FIX_NEXT", undefined],
      ["2026-12-07", "FIX_CHECK_4", undefined],
    ]);
  });

  test("MID or OK adds no exam-ops task", () => {
    expect(
      buildPlan({ ...pdfInput(), examOps: "MID" }).tasks.some((t) =>
        t.taskId.startsWith("EXAMOPS_"),
      ),
    ).toBe(false);
  });
});
