// 4-week plan (21_4주플랜, 15_4주과제 copy). Area orders come in already
// sorted low to high by the 23 tie rule, so the plan never re-ranks areas.

import type { P1Code, P2Code } from "./codes.js";
import { sheetRows, textCell } from "./sheet.js";
import { COPY_TEXT } from "./source/copyText.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Scores,
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

const DAY_MS = 86_400_000;

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

export function buildPlan(input: PlanInput): Pick<Plan, "columns" | "tasks"> {
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
  const tasks: PlanTask[] = WEEKS.flatMap(({ week, from }) =>
    columns.map((area, index) => {
      // 21 C11: task AREA_{code}_ACTn, done DONE_{code}_{n} else DONE_GENERIC
      const doneId = `DONE_${area}_${week}`;
      return task(from + first(COLUMN_OFFSETS, index, "column offset"), {
        taskId: `AREA_${area}_ACT${week}`,
        doneId: doneId in COPY_TEXT ? doneId : "DONE_GENERIC",
        column: (index + 1) as 1 | 2 | 3,
        area,
      });
    }),
  );
  return { columns, tasks };
}
