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

// 18 r18 C: candidates and their fixed order (NS, HA, RD, PS).
const REP_CANDIDATES = textCell(tempRow(18), 2)
  .split(" \u00b7 ")
  .map((code) => {
    const dim = TEMP_DIMS.find((d) => d === code);
    if (!dim) throw new Error(`unknown candidate ${code}`);
    return dim;
  });

// 18 r19: a gap under this value between 1st and 2nd is 혼합형.
const MIXED_GAP = numberCell(tempRow(19), 2);

export type Representative = {
  readonly kind: "single" | "mixed";
  /** 1st candidate */
  readonly dim: TempDim;
  /** 1st and 2nd candidate, set when kind is mixed */
  readonly dims?: readonly [TempDim, TempDim];
  /** all four candidates, best first (23 r13-r15 order) */
  readonly ranked: readonly TempDim[];
};

/** 18 r18-r19 with the 23 r13-r15 tie rule: score, extreme answers, fixed order. */
export function representativeTemperament(
  dims: Readonly<Record<TempDim, TempDimScore>>,
): Representative {
  const ranked = [...REP_CANDIDATES].sort(
    (a, b) =>
      dims[b].score - dims[a].score ||
      dims[b].extremes - dims[a].extremes ||
      REP_CANDIDATES.indexOf(a) - REP_CANDIDATES.indexOf(b),
  );
  const [first, second] = ranked;
  if (!first || !second) throw new Error("need two representative candidates");
  const mixed = dims[first].score - dims[second].score < MIXED_GAP;
  return mixed
    ? { kind: "mixed", dim: first, dims: [first, second], ranked }
    : { kind: "single", dim: first, ranked };
}
