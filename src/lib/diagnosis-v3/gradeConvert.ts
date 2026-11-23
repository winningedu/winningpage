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

/** q6 in the q4 grade system as a 9-grade value; null when q4 has no table. */
export function toNineGrade(q4: Ordinal, q6: number): number | null {
  switch (systemOf(q4)) {
    case "NINE":
      return q6;
    case "FIVE":
      return FIVE_TO_NINE.get(fiveKey(q6)) ?? null;
    default:
      return null;
  }
}
