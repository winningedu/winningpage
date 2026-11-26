// Copy lookup shared by the page builders: COPY_TEXT ids, raw copy sheet
// cells, 22_리포트요소 cells, and strict {placeholder} filling.

import { sheetRows, textCell } from "./sheet.js";
import { COPY_SHEETS, COPY_TEXT } from "./source/copyText.js";

// Report copy not in the copy xlsx yet (client answer 2026-11-24 학습진단 5번).
// Drafts awaiting client confirmation; move them into the xlsx once confirmed.
/** M3 subjects under 26 dropped from the table (table 10 starts at 26). */
export const SUBJ_BELOW_EXCLUDED_NOTE =
  "26점 미만 과목은 9등급 환산표 범위 밖이라 과목 판정에서 제외했어요.";
/** M3 with every entered subject under 26: the table is skipped. */
export const SUBJ_ALL_BELOW_NOTE =
  "입력한 과목 점수가 모두 26점 미만이라 9등급 환산표 범위 밖이에요. 과목 판정을 생략했어요.";
/** High school 성취평가제: the table is skipped (16 r8). */
export const SUBJ_ACHIEVEMENT_NOTE =
  "성취평가제 성적은 과목별 9등급 판정을 하지 않아요.";
/** M3 6번 is the auto average of 원점수, not a grade on the 4번 system. */
export const MIDDLE_AVERAGE_LABEL = "평균 점수";

/** COPY_TEXT[id]; a missing id is a sheet or code bug, so it throws. */
export function copy(id: string): string {
  const text = COPY_TEXT[id];
  if (text === undefined) throw new Error("missing copy " + id);
  return text;
}

/** Fills every {key} of the copy id; a key without a value throws. */
export function fill(
  id: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return fillText(copy(id), values, id);
}

/** Fills every {key} of a piece of copy text; a key without a value throws. */
export function fillText(
  text: string,
  values: Readonly<Record<string, string | number>>,
  id: string,
): string {
  return text.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined)
      throw new Error("no value for {" + key + "} in " + id);
    return String(value);
  });
}

/** One cell of the copy sheet row whose A column is the id. */
export function copyCell(sheet: string, id: string, col: number): string {
  const row = (COPY_SHEETS[sheet] ?? []).find((r) => r.c[0] === id);
  const value = row?.c[col];
  if (value === null || value === undefined) {
    throw new Error("missing copy cell " + sheet + " " + id + " c" + col);
  }
  return String(value);
}

const reportRows = sheetRows("22_리포트요소");

/** One 22_리포트요소 cell (A=0 .. E=4). */
export function reportCell(r: number, col: number): string {
  const row = reportRows.find((x) => x.r === r);
  if (!row) throw new Error("missing 22_리포트요소 r" + r);
  return textCell(row, col);
}

/** Numbers captured by the pattern in a sheet text; throws on no match. */
export function numbersIn(text: string, pattern: RegExp): number[] {
  const found = text.match(pattern);
  if (!found) throw new Error("unexpected sheet text " + text);
  return found.slice(1).map(Number);
}
