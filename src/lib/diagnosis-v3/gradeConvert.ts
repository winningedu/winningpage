// 4번 grade system to 9-grade conversion (16 r5-r9, tables 09 and 12).
// Pure TS: values come from the score sheets, never from constants here.

import { OPTIONS } from "./options.js";
import { numberCell, sheetRows } from "./sheet.js";
import type { Ordinal } from "./types.js";

type GradeSystem = "NINE" | "FIVE" | "ACHIEVEMENT" | "UNKNOWN";

/** 16 r6-r9: the C column names the table; 환산 없음 is 9등급제 or unknown. */
const systemOf = (q4: Ordinal): GradeSystem | null => {
  const option = OPTIONS.q4.find((o) => o.ordinal === q4);
  if (!option) return null;
  if (option.code === "09_환산_5등급제") return "FIVE";
  if (option.code === "12_환산_성취평가제") return "ACHIEVEMENT";
  return option.label.startsWith("잘 모르겠") ? "UNKNOWN" : "NINE";
};

/** 09 r5-r405: grade x 100 (integer key) to its 9-grade value. */
const FIVE_TO_NINE = new Map<number, number>(
  sheetRows("09_환산_5등급제")
    .filter((row) => typeof row.c[0] === "number")
    .map((row) => [Math.round(numberCell(row, 1) * 100), numberCell(row, 2)]),
);
const FIVE_KEYS = [...FIVE_TO_NINE.keys()];
const FIVE_MIN = Math.min(...FIVE_KEYS);
const FIVE_MAX = Math.max(...FIVE_KEYS);

/** Snap to the 0.01 grid half-up, then clamp to the table domain (09 r5, r405). */
const fiveKey = (raw: number) =>
  Math.min(
    FIVE_MAX,
    Math.max(FIVE_MIN, Math.round(Number((raw * 100).toPrecision(15)))),
  );

/**
 * 12 r5-r9 A to E in order: lower bound of the 원점수 interval ("90 ~ 100점")
 * and its 9-grade value. E ("60점 미만") has no lower bound and catches the rest.
 */
const ACHIEVEMENT_BANDS = sheetRows("12_환산_성취평가제")
  .filter((row) => /^[A-E]$/.test(String(row.c[0])))
  .map((row) => ({
    lower: Number(/^(\d+)\s*~/.exec(String(row.c[1]))?.[1] ?? Number.NaN),
    nine: numberCell(row, 3),
  }));

const achievementToNine = (average: number) =>
  (
    ACHIEVEMENT_BANDS.find((band) => average >= band.lower) ??
    ACHIEVEMENT_BANDS[ACHIEVEMENT_BANDS.length - 1]
  )?.nine ?? null;

/** 16 r20: entry year from which high school uses the 5등급제. */
const FIVE_FROM_ENTRY_YEAR = (() => {
  const row = sheetRows("16_문항규칙").find(
    (r) => r.c[0] === "Q04 기본값" && String(r.c[1]).startsWith("고등학교"),
  );
  const year = /(\d{4})년 이후/.exec(String(row?.c[2]))?.[1];
  if (!year) throw new Error("16 r20 entry year missing");
  return Number(year);
})();

const ordinalOf = (system: GradeSystem): Ordinal => {
  const option = OPTIONS.q4.find((o) => systemOf(o.ordinal) === system);
  if (!option) throw new Error(`no q4 option for ${system}`);
  return option.ordinal;
};

/**
 * Default q4 for the survey (16 r19-r21). Entry year = school year - grade + 1
 * (16 r20); January and February still belong to the previous school year
 * (judge-report R13). diagnosedAt is an ISO date.
 */
export function defaultQ4(q1: Ordinal, diagnosedAt: string): Ordinal {
  const label = OPTIONS.q1.find((o) => o.ordinal === q1)?.label;
  if (label === undefined) throw new Error(`unknown q1 ${q1}`);
  const highGrade = /^고등학교 (\d)학년$/.exec(label)?.[1];
  if (highGrade === undefined) {
    return ordinalOf(label.startsWith("중학교") ? "ACHIEVEMENT" : "NINE");
  }
  const year = Number(diagnosedAt.slice(0, 4));
  const month = Number(diagnosedAt.slice(5, 7));
  const schoolYear = month <= 2 ? year - 1 : year;
  const entryYear = schoolYear - Number(highGrade) + 1;
  return ordinalOf(entryYear >= FIVE_FROM_ENTRY_YEAR ? "FIVE" : "NINE");
}

/** q6 in the q4 grade system as a 9-grade value; null when q4 has no table. */
export function toNineGrade(q4: Ordinal, q6: number): number | null {
  switch (systemOf(q4)) {
    case "NINE":
      return q6;
    case "FIVE":
      return FIVE_TO_NINE.get(fiveKey(q6)) ?? null;
    case "ACHIEVEMENT":
      return achievementToNine(q6);
    default:
      return null;
  }
}
