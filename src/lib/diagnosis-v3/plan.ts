// 4-week plan (21_4주플랜, 15_4주과제 copy). Area orders come in already
// sorted low to high by the 23 tie rule, so the plan never re-ranks areas.

import { AREAS, type P1Code, type P2Code } from "./codes.js";
import { OPTIONS } from "./options.js";
import { sheetRows, textCell } from "./sheet.js";
import { COPY_SHEETS, COPY_TEXT } from "./source/copyText.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Scores,
  EventKind,
  IsoDate,
  Ordinal,
  PlannerPage,
  PlanTask,
  ScheduleEvent,
} from "./types.js";

export type ExamOps = DiagnosisV3Scores["examOps"];
export type Plan = DiagnosisV3Scores["plan"];
type Week = PlanTask["week"];

export type PlanInput = {
  readonly diagnosedAt: IsoDate;
  /** PAGE1 stages, low to high (23 rule) */
  readonly page1Order: readonly P1Code[];
  /** PAGE2 areas, low to high (23 rule) */
  readonly page2Order: readonly P2Code[];
  readonly schedule: DiagnosisV3Answers["q13"];
  readonly examOps: ExamOps;
  /** q21 weekday ordinal */
  readonly weekdayLoad: Ordinal;
};

const planSheet = sheetRows("21_4주플랜");

const planRow = (r: number) => {
  const row = planSheet.find((x) => x.r === r);
  if (!row) throw new Error(`missing 21_4주플랜 r${r}`);
  return row;
};

/** 21 C cell of one row. */
const planCell = (r: number): string => textCell(planRow(r), 2);

const match = (text: string, pattern: RegExp): RegExpMatchArray => {
  const found = text.match(pattern);
  if (!found) throw new Error(`unexpected sheet text ${text}`);
  return found;
};

// 21 C6: week n spans "Day a~b"
export const WEEKS: readonly { week: Week; from: number; to: number }[] = [
  ...planCell(6).matchAll(/(\d)주차 Day (\d+)~(\d+)/g),
].map((m) => ({
  week: Number(m[1]) as Week,
  from: Number(m[2]),
  to: Number(m[3]),
}));

// 21 C13-C15: column offsets from the week start day ("+1일")
const COLUMN_OFFSETS = [13, 14, 15].map((r) =>
  Number(match(planCell(r), /^\+(\d+)일$/)[1]),
);

// 21 C16: weekly check offset; 21 C17, C19: start and wrap-up days
const CHECK_OFFSET = Number(match(planCell(16), /^\+(\d+)일/)[1]);
const dayCell = (r: number) => Number(match(planCell(r), /^Day (\d+)$/)[1]);
const START_DAY = dayCell(17);
const NEXT_DAY = dayCell(19);
// 21 C7: re-diagnosis day; 21 B28: after-plan window "Day 29~42"
const REDX_DAY = dayCell(7);
const [AFTER_FROM, AFTER_TO] = match(
  textCell(planRow(28), 1),
  /^Day (\d+)~(\d+) /,
)
  .slice(1)
  .map(Number) as [number, number];

/** Same-day order of the planner table (PDF p12-p15). */
const rank = (taskId: string): number => {
  if (taskId === "FIX_START") return 0;
  if (taskId.startsWith("AREA_")) return 1;
  if (taskId.startsWith("EVT_")) return 2;
  if (taskId.startsWith("EXAMOPS_")) return 3;
  if (taskId === "FIX_NEXT") return 4;
  return 5;
};

// 21 r21-r25: per event kind, tasks "n일 전 EVT_*" (ETC has none)
const eventTasksAt = (r: number, kind: EventKind) => {
  if (textCell(planRow(r), 1) !== `EVENT:${kind}`) {
    throw new Error(`21_4주플랜 r${r} is not EVENT:${kind}`);
  }
  return [...planCell(r).matchAll(/(\d+)일 전 (EVT_\w+)/g)].map((m) => ({
    before: Number(m[1]),
    taskId: String(m[2]),
  }));
};
const EVENT_TASKS: Readonly<
  Record<EventKind, readonly { before: number; taskId: string }[]>
> = {
  EXAM: eventTasksAt(21, "EXAM"),
  PERF: eventTasksAt(22, "PERF"),
  MOCK: eventTasksAt(23, "MOCK"),
  APPLY: eventTasksAt(24, "APPLY"),
  ETC: eventTasksAt(25, "ETC"),
};

// 21 B27: event kinds whose day reduces its week, "일정(EXAM, PERF, APPLY)"
const REDUCING_KINDS = match(
  textCell(planRow(27), 1),
  /\(([A-Z\u00b7]+)\)/,
)[1]?.split("\u00b7") as readonly EventKind[];

// 21 C37: exam-ops task, first exam at least "진단일+n일" away, D-k, else Day m
const [EXAMOPS_MIN_GAP, EXAMOPS_BEFORE, EXAMOPS_DEFAULT_DAY] = match(
  planCell(37),
  /진단일\+(\d+)일 .*D-(\d+)에 EXAMOPS_TASK_EXAM, 없으면 Day (\d+)에 EXAMOPS_TASK$/,
)
  .slice(1)
  .map(Number) as [number, number, number];

const DAY_MS = 86_400_000;

/** Day number of a date, Day 1 = diagnosedAt. */
export function dayOfDate(diagnosedAt: IsoDate, date: IsoDate): number {
  const diff =
    Date.parse(`${date}T00:00:00Z`) - Date.parse(`${diagnosedAt}T00:00:00Z`);
  return Math.round(diff / DAY_MS) + 1;
}

/** Calendar date of a Day number, Day 1 = diagnosedAt. */
export function dateOfDay(diagnosedAt: IsoDate, day: number): IsoDate {
  const base = Date.parse(`${diagnosedAt}T00:00:00Z`);
  return new Date(base + (day - 1) * DAY_MS).toISOString().slice(0, 10);
}

/** 21 C37, spec row 77: one task only when exam ops is RISK. */
function examOpsTasks(
  input: PlanInput,
  within: readonly ScheduleEvent[],
  task: (
    day: number,
    rest: Omit<PlanTask, "date" | "day" | "week">,
  ) => PlanTask,
): PlanTask[] {
  if (input.examOps !== "RISK") return [];
  const exam = within
    .filter((e) => e.kind === "EXAM")
    .map((event) => ({ event, day: dayOfDate(input.diagnosedAt, event.date) }))
    .filter(({ day }) => day >= START_DAY + EXAMOPS_MIN_GAP)
    .sort((a, b) => a.day - b.day)[0];
  if (!exam) return [task(EXAMOPS_DEFAULT_DAY, { taskId: "EXAMOPS_TASK" })];
  // spec row 77: never before the day after diagnosis
  const day = Math.max(exam.day - EXAMOPS_BEFORE, START_DAY + 1);
  return [task(day, { taskId: "EXAMOPS_TASK_EXAM", event: exam.event })];
}

/** 21 C32: q21 weekday MINLOAD:n code (14 r144-r148), minutes. */
const minLoadOf = (weekday: Ordinal): number => {
  const code = OPTIONS.q21Weekday.find((o) => o.ordinal === weekday)?.code;
  return Number(match(String(code), /^MINLOAD:(\d+)$/)[1]);
};

const weekOf = (day: number): Week => {
  const week = WEEKS.find((w) => day >= w.from && day <= w.to)?.week;
  if (!week) throw new Error(`day ${day} is outside the plan`);
  return week;
};

const first = <T>(list: readonly T[], index: number, what: string): T => {
  const value = list[index];
  if (value === undefined) throw new Error(`missing ${what} ${index + 1}`);
  return value;
};

export function buildPlan(input: PlanInput): Plan {
  // 21 C9: columns 1-2 = two lowest PAGE1 stages; 21 C10: column 3 = lowest PAGE2 area
  const columns: Plan["columns"] = [
    first(input.page1Order, 0, "PAGE1 stage"),
    first(input.page1Order, 1, "PAGE1 stage"),
    first(input.page2Order, 0, "PAGE2 area"),
  ];
  const task = (
    day: number,
    rest: Omit<PlanTask, "date" | "day" | "week">,
  ): PlanTask => ({
    date: dateOfDay(input.diagnosedAt, day),
    day,
    week: weekOf(day),
    ...rest,
  });
  const lastDay = first(WEEKS, WEEKS.length - 1, "week").to;
  const events = Array.isArray(input.schedule) ? input.schedule : [];
  const within = events.filter((e) => {
    const day = dayOfDate(input.diagnosedAt, e.date);
    return day >= 1 && day <= lastDay;
  });
  // 21 B27: weeks holding an EXAM, PERF or APPLY day
  const reducedWeeks = WEEKS.map((w) => w.week).filter((week) =>
    within.some(
      (e) =>
        REDUCING_KINDS.includes(e.kind) &&
        weekOf(dayOfDate(input.diagnosedAt, e.date)) === week,
    ),
  );
  const areaTasks = WEEKS.flatMap(({ week, from }) =>
    columns.map((area, index) => {
      // 21 C11: task AREA_{code}_ACTn, done DONE_{code}_{n} else DONE_GENERIC
      const doneId = `DONE_${area}_${week}`;
      // 21 D27: a reduced week's column 3 done is DONE_REDUCED
      const reduced = index === 2 && reducedWeeks.includes(week);
      return task(from + first(COLUMN_OFFSETS, index, "column offset"), {
        taskId: `AREA_${area}_ACT${week}`,
        doneId: reduced
          ? "DONE_REDUCED"
          : doneId in COPY_TEXT
            ? doneId
            : "DONE_GENERIC",
        column: (index + 1) as 1 | 2 | 3,
        area,
      });
    }),
  );
  const fixedTasks = [
    task(START_DAY, { taskId: "FIX_START" }),
    task(NEXT_DAY, { taskId: "FIX_NEXT" }),
    ...WEEKS.map(({ week, from }) =>
      task(from + CHECK_OFFSET, { taskId: `FIX_CHECK_${week}` }),
    ),
  ];
  // 21 r21-r25 offsets; 21 C26: a task that lands before Day 1 is dropped
  const eventTasks = within.flatMap((event) =>
    EVENT_TASKS[event.kind]
      .map(({ before, taskId }) => ({
        day: dayOfDate(input.diagnosedAt, event.date) - before,
        taskId,
      }))
      .filter(({ day }) => day >= 1)
      .map(({ day, taskId }) => task(day, { taskId, event })),
  );
  const tasks = [
    ...areaTasks,
    ...fixedTasks,
    ...eventTasks,
    ...examOpsTasks(input, within, task),
  ].sort((a, b) => a.day - b.day || rank(a.taskId) - rank(b.taskId));
  // 21 C28: Day 29..42 events are listed after the plan, never tasks
  const afterEvents = events.filter((e) => {
    const day = dayOfDate(input.diagnosedAt, e.date);
    return day >= AFTER_FROM && day <= AFTER_TO;
  });
  return {
    columns,
    tasks,
    reducedWeeks,
    afterEvents,
    redxDate: dateOfDay(input.diagnosedAt, REDX_DAY),
    minLoad: minLoadOf(input.weekdayLoad),
  };
}

const copy = (id: string): string => {
  const text = COPY_TEXT[id];
  if (text === undefined) throw new Error(`missing copy ${id}`);
  return text;
};

/** Fills {key} placeholders; an absent value drops the placeholder and its trailing space. */
export function fillCopy(
  id: string,
  values: Readonly<Record<string, string | number | undefined>>,
): string {
  return copy(id).replace(/\{(\w+)\} ?/g, (whole, key: string) => {
    const value = values[key];
    if (value === undefined) return "";
    return whole.endsWith(" ") ? `${value} ` : String(value);
  });
}

// Weekday names come from the runtime ko-KR locale: no sheet has them.
const WEEKDAY = new Intl.DateTimeFormat("ko-KR", {
  weekday: "short",
  timeZone: "UTC",
});

/** 11 plan.due: {mm}/{dd}({dow}) */
export function formatDue(date: IsoDate): string {
  const value = new Date(`${date}T00:00:00Z`);
  return fillCopy("plan.due", {
    mm: value.getUTCMonth() + 1,
    dd: value.getUTCDate(),
    dow: WEEKDAY.format(value),
  });
}

// 21 C31: target run rate per week, "1주 50%"
export const RATES: readonly number[] = [
  ...planCell(31).matchAll(/(\d)주 (\d+)%/g),
].map((m) => Number(m[2]));

const taskRows = COPY_SHEETS["15_4주과제"];
if (!taskRows) throw new Error("missing copy sheet 15_4주과제");
/** 15 B (kind) and D (done criterion) of a copy id. */
const taskRow = (id: string) => {
  const row = taskRows.find((x) => x.c[0] === id);
  if (!row) throw new Error(`missing 15_4주과제 ${id}`);
  return { kind: String(row.c[1]), done: String(row.c[3]) };
};

/** Display text of a plan task: {subject} from q13, PLAN_REDUCE on a reduced column 3 (21 C27). */
export function taskText(plan: Plan, task: PlanTask): string {
  const text = fillCopy(task.taskId, { subject: task.event?.subject });
  const reduced = task.column === 3 && plan.reducedWeeks.includes(task.week);
  return reduced ? `${text} ${copy("PLAN_REDUCE")}` : text;
}

/** 22 r111 row: area label (05 B, else 15 B), due date, done criterion (15 D). */
const tableRow = (
  plan: Plan,
  task: PlanTask,
): PlannerPage["tasks"][number] => ({
  area: task.area ? AREAS[task.area].label : taskRow(task.taskId).kind,
  task: taskText(plan, task),
  due: formatDue(task.date),
  done: taskRow(task.doneId ?? task.taskId).done,
});

/** 22 r109-r113: one planner page per week. */
export function buildPlannerPages(
  plan: Plan,
  diagnosedAt: IsoDate,
  schedule: DiagnosisV3Answers["q13"],
): PlannerPage[] {
  const eventDates = new Set(
    Array.isArray(schedule) ? schedule.map((e) => e.date) : [],
  );
  const log = taskRow("FIX_LOG");
  const logDone = log.done;
  // 15 r7: FIX_LOG is due every day, its 15 B label stands in the due column
  const logRow = {
    area: log.kind,
    task: copy("FIX_LOG"),
    due: log.kind,
    done: log.done,
  };
  return WEEKS.map(({ week, from, to }) => {
    const weekTasks = plan.tasks.filter((t) => t.week === week);
    // 22 r110: record days, plan.rate, first column done that differs from FIX_LOG's
    const columnDone = weekTasks
      .filter((t) => t.column !== undefined && t.doneId !== undefined)
      .map((t) => taskRow(String(t.doneId)).done)
      .find((done) => done !== logDone);
    const rate = first(RATES, week - 1, "week rate");
    return {
      week,
      goal: copy(`WEEK_GOAL_${week}`),
      badge: fillCopy("plan.week_badge", { n: week, d1: from, d2: to }),
      redx: fillCopy("plan.redx", { date: formatDue(plan.redxDate) }),
      done: [
        logDone,
        fillCopy("plan.rate", { rate }),
        ...(columnDone === undefined ? [] : [columnDone]),
      ],
      tasks: [logRow, ...weekTasks.map((t) => tableRow(plan, t))],
      // 22 r112: 7 day cells, tasks due that day, diagnosis day and event days stand out
      days: Array.from({ length: to - from + 1 }, (_, i) => {
        const date = dateOfDay(diagnosedAt, from + i);
        return {
          date: formatDue(date),
          tasks: weekTasks
            .filter((t) => t.date === date)
            .map((t) => taskText(plan, t)),
          highlight: from + i === START_DAY || eventDates.has(date),
        };
      }),
      // 22 r113
      slip: [1, 2, 3].map((n) => copy(`PLAN_SLIP_${n}`)),
    };
  });
}
