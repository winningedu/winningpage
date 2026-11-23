// Copy lookup shared by the page builders: COPY_TEXT ids, raw copy sheet
// cells, 22_리포트요소 cells, and strict {placeholder} filling.

import { sheetRows, textCell } from "./sheet.js";
import { COPY_SHEETS, COPY_TEXT } from "./source/copyText.js";

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
  return copy(id).replace(/\{([^{}]+)\}/g, (_, key: string) => {
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
