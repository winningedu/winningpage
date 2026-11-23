import { SCORE_SHEETS, type SheetRow } from "./source/scoreSheets.js";

export type { SheetRow };

/** Rows of one score sheet; a missing sheet is a generator bug, so it throws. */
export function sheetRows(name: string): readonly SheetRow[] {
  const rows = SCORE_SHEETS[name];
  if (!rows) throw new Error(`missing score sheet ${name}`);
  return rows;
}

/** One cell as text; throws when the cell is empty. */
export function textCell(row: SheetRow, col: number): string {
  const value = row.c[col];
  if (value === null || value === undefined) {
    throw new Error(`empty cell r${row.r} c${col}`);
  }
  return String(value);
}

/** One cell as a number; throws when the cell is not numeric. */
export function numberCell(row: SheetRow, col: number): number {
  const value = Number(row.c[col]);
  if (row.c[col] === null || Number.isNaN(value)) {
    throw new Error(`not a number r${row.r} c${col}`);
  }
  return value;
}
