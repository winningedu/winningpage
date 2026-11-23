import { describe, expect, test } from "vitest";
import type { P1Code, P2Code } from "./codes.js";
import {
  buildPlan,
  buildPlannerPages,
  buildPlanPage,
  fillCopy,
  type PlanInput,
} from "./plan.js";
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

describe("buildPlanPage (22 r103-r107)", () => {
  const page = () =>
    buildPlanPage(buildPlan(pdfInput()), "2026-11-10", pdfInput().schedule);

  test("PDF p11 table: column labels, ACTn cells, reduced week 4 with PLAN_REDUCE", () => {
    const table = page().table;
    expect(table.columns).toEqual(["우선순위", "학습 수행", "탐구 심화"]);
    expect(table.weeks[0]).toEqual({
      week: 1,
      cells: [
        COPY_TEXT.AREA_P1_PRIO_ACT1,
        COPY_TEXT.AREA_P1_EXEC_ACT1,
        COPY_TEXT.AREA_H12_DEEP_ACT1,
      ],
      reduced: false,
    });
    expect(table.weeks[3]?.reduced).toBe(true);
    expect(table.weeks[3]?.cells[2]).toBe(
      `${COPY_TEXT.AREA_H12_DEEP_ACT4} ${COPY_TEXT.PLAN_REDUCE}`,
    );
    expect(table.reduceNote).toBe(COPY_TEXT.PLAN_REDUCE);
    expect(table.ruleNote).toBe(COPY_TEXT.PLAN_RULE_NOTE);
  });

  test("PDF p11 numbers: record 1 minute, rates 50/60/65/70, plan.minload 60 (21 r30-r32)", () => {
    expect(page().numbers).toEqual({
      logMinutes: 1,
      rates: [50, 60, 65, 70],
      minLoad: "하루 최소 학습량 60분",
    });
  });

  test("22 r107 checkpoints: each week's last day, re-diagnosis, Day 29..42 events", () => {
    expect(page().checkpoints).toEqual([
      "11/16(월)",
      "11/23(월)",
      "11/30(월)",
      "12/7(월)",
      "12/8(화)",
    ]);
    const plan = buildPlan(calcInput());
    expect(
      buildPlanPage(plan, "2026-11-09", CALC_EXAMPLE.q13).checkpoints.slice(4),
    ).toEqual(["12/7(월)", "12/10(목)"]);
  });

  test("calc example: 수행평가 within 4 weeks, 기말 Day 32 in plan.after_note", () => {
    const plan = buildPlan(calcInput());
    expect(buildPlanPage(plan, "2026-11-09", CALC_EXAMPLE.q13).events).toEqual({
      kind: "events",
      within: ["수행평가 11/27(금)"],
      after: fillCopy("plan.after_note", { events: "정기고사 12/10(목)" }),
    });
  });

  test("PDF p11: 정기고사 12/7(월) within, no after note; no events is PLAN_NOEVENT", () => {
    expect(page().events).toEqual({
      kind: "events",
      within: ["정기고사 12/7(월)"],
    });
    const none = buildPlan({ ...pdfInput(), schedule: "NONE" });
    expect(buildPlanPage(none, "2026-11-10", "NONE").events).toEqual({
      kind: "none",
      text: COPY_TEXT.PLAN_NOEVENT,
    });
  });
});

describe("buildPlannerPages (22 r109-r113)", () => {
  const pages = () =>
    buildPlannerPages(buildPlan(pdfInput()), "2026-11-10", pdfInput().schedule);

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

  test("PDF p12, p15 day cells: 7 dates, due tasks, diagnosis and event days highlighted", () => {
    const all = pages();
    const week1 = all[0]?.days ?? [];
    expect(week1).toHaveLength(7);
    expect(week1[0]).toEqual({
      date: "11/10(화)",
      tasks: [COPY_TEXT.FIX_START],
      highlight: true,
    });
    expect(week1[2]).toEqual({
      date: "11/12(목)",
      tasks: [],
      highlight: false,
    });
    expect(all[3]?.days[6]).toEqual({
      date: "12/7(월)",
      tasks: [COPY_TEXT.FIX_NEXT, COPY_TEXT.FIX_CHECK_4],
      highlight: true,
    });
  });

  test("22 r113: slip rules PLAN_SLIP_1..3 on every page", () => {
    for (const page of pages()) {
      expect(page.slip).toEqual([
        COPY_TEXT.PLAN_SLIP_1,
        COPY_TEXT.PLAN_SLIP_2,
        COPY_TEXT.PLAN_SLIP_3,
      ]);
    }
  });

  test("PDF p12 task table: FIX_LOG row first, then due tasks with area, due, done", () => {
    expect(pages()[0]?.tasks).toEqual([
      {
        area: "매일",
        task: COPY_TEXT.FIX_LOG,
        due: "매일",
        done: "주 7일 중 5일 이상",
      },
      {
        area: "시작",
        task: COPY_TEXT.FIX_START,
        due: "11/10(화)",
        done: "목표 1문장",
      },
      {
        area: "우선순위",
        task: COPY_TEXT.AREA_P1_PRIO_ACT1,
        due: "11/11(수)",
        done: "중요\u00b7급함 4칸 표 1장",
      },
      {
        area: "학습 수행",
        task: COPY_TEXT.AREA_P1_EXEC_ACT1,
        due: "11/13(금)",
        done: "최소 학습량 5일 이상",
      },
      {
        area: "탐구 심화",
        task: COPY_TEXT.AREA_H12_DEEP_ACT1,
        due: "11/15(일)",
        done: "탐구 질문 1문장 + 교과서 근거 1개",
      },
      {
        area: "1주 점검",
        task: COPY_TEXT.FIX_CHECK_1,
        due: "11/16(월)",
        done: "실행률 % + 다음 주 분량표",
      },
    ]);
  });

  test("PDF p15: reduced column 3 gets PLAN_REDUCE, EVT_EXAM drops the empty {subject}", () => {
    const tasks = pages()[3]?.tasks ?? [];
    expect(tasks.find((t) => t.area === "탐구 심화")).toEqual({
      area: "탐구 심화",
      task: `${COPY_TEXT.AREA_H12_DEEP_ACT4} ${COPY_TEXT.PLAN_REDUCE}`,
      due: "12/6(일)",
      done: "이번 주는 절반 분량 완료",
    });
    expect(tasks.find((t) => t.area === "정기고사")).toEqual({
      area: "정기고사",
      task: "시험 대비 실전 리허설 1회 (시간 재고 풀기)",
      due: "12/4(금)",
      done: "리허설 점수 기록",
    });
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

  test("98 r15: two events of one kind on one day add that day's tasks once", () => {
    const twin = { kind: "PERF", date: "2026-11-27" } as const;
    const plan = buildPlan({ ...calcInput(), schedule: [twin, twin] });
    const ids = plan.tasks.map((t) => `${t.taskId}@${t.date}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan.tasks.filter((t) => t.taskId.startsWith("EVT_"))).toHaveLength(
      2,
    );
  });

  const eventPlan = (schedule: PlanInput["schedule"]) =>
    buildPlan({ ...calcInput(), schedule });
  const eventTasks = (plan: ReturnType<typeof buildPlan>) =>
    plan.tasks
      .filter((t) => t.event !== undefined)
      .map((t) => [t.taskId, t.date]);

  test("MOCK Day 15 adds EVT_MOCK 2 days before and reduces no week (21 r23, r27)", () => {
    const plan = eventPlan([{ kind: "MOCK", date: "2026-11-23" }]);
    expect(eventTasks(plan)).toEqual([["EVT_MOCK", "2026-11-21"]]);
    expect(plan.reducedWeeks).toEqual([]);
  });

  test("ETC is shown on its day only: no task, no reduced week (21 r25, r27)", () => {
    const plan = eventPlan([{ kind: "ETC", date: "2026-11-23" }]);
    expect(eventTasks(plan)).toEqual([]);
    expect(plan.reducedWeeks).toEqual([]);
    const page = buildPlannerPages(plan, "2026-11-09", [
      { kind: "ETC", date: "2026-11-23" },
    ]);
    expect(page[2]?.days[0]?.highlight).toBe(true);
  });

  test("APPLY Day 20 adds EVT_APPLY 7 days before and reduces its week (21 r24, r27)", () => {
    const plan = eventPlan([{ kind: "APPLY", date: "2026-11-28" }]);
    expect(eventTasks(plan)).toEqual([["EVT_APPLY", "2026-11-21"]]);
    expect(plan.reducedWeeks).toEqual([3]);
  });

  test("an area without DONE_<code>_<week> rows uses DONE_GENERIC (21 C11)", () => {
    const plan = buildPlan({
      ...calcInput(),
      schedule: "NONE",
      page2Order: ["H3_GPA", ...CALC_P2],
    });
    expect(
      plan.tasks.filter((t) => t.column === 3).map((t) => t.doneId),
    ).toEqual(Array(4).fill("DONE_GENERIC"));
  });

  test("MID or OK adds no exam-ops task", () => {
    expect(
      buildPlan({ ...pdfInput(), examOps: "MID" }).tasks.some((t) =>
        t.taskId.startsWith("EXAMOPS_"),
      ),
    ).toBe(false);
  });
});
