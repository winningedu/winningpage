// 4-week plan (21_4주플랜, 15_4주과제 copy). Area orders come in already
// sorted low to high by the 23 tie rule, so the plan never re-ranks areas.

import type { P1Code, P2Code } from "./codes.js";
import { sheetRows, textCell } from "./sheet.js";
import { COPY_TEXT } from "./source/copyText.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Scores,
  EventKind,
  IsoDate,
  Ordinal,
  PlanTask,
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

/** 21 C cell of one row. */
const planCell = (r: number): string => {
  const row = planSheet.find((x) => x.r === r);
  if (!row) throw new Error(`missing 21_4주플랜 r${r}`);
  return textCell(row, 2);
};

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
const planRow = (r: number) => {
  const row = planSheet.find((x) => x.r === r);
  if (!row) throw new Error(`missing 21_4주플랜 r${r}`);
  return row;
};
const EVENT_TASKS: Readonly<
  Record<EventKind, readonly { before: number; taskId: string }[]>
> = Object.fromEntries(
  [21, 22, 23, 24, 25].map((r) => [
    textCell(planRow(r), 1).slice("EVENT:".length),
    [...planCell(r).matchAll(/(\d+)일 전 (EVT_\w+)/g)].map((m) => ({
      before: Number(m[1]),
      taskId: String(m[2]),
    })),
  ]),
) as Record<EventKind, readonly { before: number; taskId: string }[]>;

// 21 B27: event kinds whose day reduces its week, "일정(EXAM, PERF, APPLY)"
const REDUCING_KINDS = match(
  textCell(planRow(27), 1),
  /\(([A-Z\u00b7]+)\)/,
)[1]?.split("\u00b7") as readonly EventKind[];

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

const first = <T>(list: readonly T[], index: number, what: string): T => {
  const value = list[index];
  if (value === undefined) throw new Error(`missing ${what} ${index + 1}`);
  return value;
};

export function buildPlan(
  input: PlanInput,
): Pick<Plan, "columns" | "tasks" | "reducedWeeks"> {
  // 21 C9: columns 1-2 = two lowest PAGE1 stages; 21 C10: column 3 = lowest PAGE2 area
  const columns: Plan["columns"] = [
    first(input.page1Order, 0, "PAGE1 stage"),
    first(input.page1Order, 1, "PAGE1 stage"),
    first(input.page2Order, 0, "PAGE2 area"),
  ];
  const task = (
    day: number,
    rest: Omit<PlanTask, "date" | "day" | "week">,
  ): PlanTask => {
    const week = WEEKS.find((w) => day >= w.from && day <= w.to)?.week;
    if (!week) throw new Error(`day ${day} is outside the plan`);
    return { date: dateOfDay(input.diagnosedAt, day), day, week, ...rest };
  };
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
        task(dayOfDate(input.diagnosedAt, e.date), { taskId: "" }).week ===
          week,
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
  const tasks = [...areaTasks, ...fixedTasks, ...eventTasks].sort(
    (a, b) => a.day - b.day || rank(a.taskId) - rank(b.taskId),
  );
  return { columns, tasks, reducedWeeks };
}
