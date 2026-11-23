// Temperament engine (spec rows 87-110, score sheet 18_기질설정, copy sheet 13).
// Pure TS: sheet constants are read at module load, text lives in COPY_TEXT.

import { TEMP_DIMS, type TempDim } from "./codes.js";
import { type Likert, SCALE_ITEMS, scaleValue } from "./likert.js";
import { roundHalfUpInt } from "./round.js";
import { numberCell, sheetRows, textCell } from "./sheet.js";
import type { LikertBlock } from "./types.js";

const tempSheet = sheetRows("18_기질설정");
const tempRow = (r: number) => {
  const row = tempSheet.find((candidate) => candidate.r === r);
  if (!row) throw new Error(`missing 18_기질설정 r${r}`);
  return row;
};

export type TempLevel = "H" | "M" | "L";

// 18 r14-r16: 높음 70, 중간 40, 낮음 0 ("이 점수 이상").
const LEVEL_ROWS: readonly { level: TempLevel; min: number }[] = [
  { level: "H", min: numberCell(tempRow(14), 2) },
  { level: "M", min: numberCell(tempRow(15), 2) },
  { level: "L", min: numberCell(tempRow(16), 2) },
];

export const tempLevelOf = (score: number): TempLevel => {
  const found = LEVEL_ROWS.find((row) => score >= row.min);
  if (!found) throw new Error(`no temperament level for ${score}`);
  return found.level;
};

export type TempDimScore = {
  readonly score: number;
  readonly level: TempLevel;
  /** 23 r14: items at the extreme (매우 그렇다, reverse items 전혀) of 5 */
  readonly extremes: number;
};

/** 18 r6-r12: 5 items per dimension, the 5th reversed (01 Q23); V4 is not part of items. */
export function temperamentDims(
  q23: LikertBlock,
): Readonly<Record<TempDim, TempDimScore>> {
  const items = SCALE_ITEMS.q23;
  const dims = {} as Record<TempDim, TempDimScore>;
  for (const dim of TEMP_DIMS) {
    const values = items
      .filter((item) => item.area === dim)
      .map((item) => {
        const answer: Likert | undefined = q23.items[item.no - 1];
        if (answer === undefined) throw new Error(`no q23 answer ${item.no}`);
        return scaleValue(items, item.no, answer);
      });
    const score = roundHalfUpInt(
      values.reduce((sum, value) => sum + value, 0),
      values.length,
    );
    dims[dim] = {
      score,
      level: tempLevelOf(score),
      extremes: values.filter((value) => value === 100).length,
    };
  }
  return dims;
}
