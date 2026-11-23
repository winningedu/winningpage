// Execution urgency, 03_단일선택 A11-A17 (base points from q13) and 06_임계값
// r38-r44 (low area bonus, levels). Spec row 86, judge-report R11: the
// diagnosis day is Day 1.

import { type AreaCode, MIND_CODES } from "./codes.js";
import { numberCell, sheetRows, textCell } from "./sheet.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Scores,
  IsoDate,
} from "./types.js";

const sheet03 = sheetRows("03_단일선택");
const sheet06 = sheetRows("06_임계값");
const rowAt = (rows: typeof sheet03, r: number) => {
  const row = rows.find((candidate) => candidate.r === r);
  if (!row) throw new Error(`missing row ${r}`);
  return row;
};
const numbersIn = (text: string): number[] =>
  [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));

// 03 B12-B14 label the Day ranges, C12-C14 give the points
const WITHIN_7 = {
  to: numbersIn(textCell(rowAt(sheet03, 12), 1))[0] as number,
  points: numberCell(rowAt(sheet03, 12), 2),
};
const WITHIN_14 = {
  to: numbersIn(textCell(rowAt(sheet03, 13), 1)).at(-1) as number,
  points: numberCell(rowAt(sheet03, 13), 2),
};
const WITHIN_28 = {
  to: numbersIn(textCell(rowAt(sheet03, 14), 1)).at(-1) as number,
  points: numberCell(rowAt(sheet03, 14), 2),
};
// 03 B15 "28일 이내 원서 접수 일정이 있음"
const APPLY = {
  to: numbersIn(textCell(rowAt(sheet03, 15), 1))[0] as number,
  points: numberCell(rowAt(sheet03, 15), 2),
};
const UNKNOWN_POINTS = numberCell(rowAt(sheet03, 17), 2);

// 06 r40: bonus per area, B40 names the "under" score
const LOW_AREA_POINTS = numberCell(rowAt(sheet06, 40), 2);
const LOW_AREA_UNDER = numbersIn(textCell(rowAt(sheet06, 40), 1))[0] as number;

// 06 r41-r44, high to low
const LEVEL_FROM = {
  L4: numberCell(rowAt(sheet06, 41), 2),
  L3: numberCell(rowAt(sheet06, 42), 2),
  L2: numberCell(rowAt(sheet06, 43), 2),
  L1: numberCell(rowAt(sheet06, 44), 2),
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (date: IsoDate): number => {
  const [year, month, day] = date.split("-").map(Number);
  return (
    Date.UTC(year as number, (month as number) - 1, day as number) / DAY_MS
  );
};

/** Day number of a date, the diagnosis date is Day 1. */
export const dayNumber = (date: IsoDate, diagnosedAt: IsoDate): number =>
  utcDay(date) - utcDay(diagnosedAt) + 1;

export type UrgencyInput = {
  readonly diagnosedAt: IsoDate;
  /** q13 as answered; absent means 일정 없음 */
  readonly schedule: DiagnosisV3Answers["q13"];
  /** PAGE1 and the track PAGE2 area scores; MIND entries are ignored */
  readonly areaScores: Readonly<Partial<Record<AreaCode, number>>>;
};

const baseOf = (input: UrgencyInput): number => {
  const { schedule } = input;
  if (schedule === "UNKNOWN") return UNKNOWN_POINTS;
  if (schedule === undefined || schedule === "NONE") return 0;
  const points = schedule.map((event) => {
    const day = dayNumber(event.date, input.diagnosedAt);
    if (day < 1 || day > WITHIN_28.to) return 0;
    const byDay =
      day <= WITHIN_7.to
        ? WITHIN_7.points
        : day <= WITHIN_14.to
          ? WITHIN_14.points
          : WITHIN_28.points;
    return event.kind === "APPLY" && day <= APPLY.to
      ? Math.max(byDay, APPLY.points)
      : byDay;
  });
  return Math.max(0, ...points);
};

export function scoreUrgency(
  input: UrgencyInput,
): DiagnosisV3Scores["urgency"] {
  const base = baseOf(input);
  const lowAreas = Object.entries(input.areaScores).filter(
    ([code, score]) =>
      !(MIND_CODES as readonly string[]).includes(code) &&
      score < LOW_AREA_UNDER,
  ).length;
  const points = base + LOW_AREA_POINTS * lowAreas;
  const level =
    points >= LEVEL_FROM.L4
      ? "L4"
      : points >= LEVEL_FROM.L3
        ? "L3"
        : points >= LEVEL_FROM.L2
          ? "L2"
          : "L1";
  return { base, lowAreas, points, level };
}
