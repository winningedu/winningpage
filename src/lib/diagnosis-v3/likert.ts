// Likert answers are an index 0..4, low to high: 0 = 전혀 그렇지 않다,
// 4 = 매우 그렇다. Labels and scores come from 01_척도문항 A2.

import {
  AREAS,
  byTrack,
  MIND_CODES,
  type MindCode,
  P1_CODES,
  type P1Code,
  P2_CODES,
  type P2Code,
  TEMP_DIMS,
  type TempDim,
  TRACK_NAMES,
} from "./codes.js";
import { numberCell, sheetRows, textCell } from "./sheet.js";

export type Likert = 0 | 1 | 2 | 3 | 4;

const scaleSheet = sheetRows("01_척도문항");

const legendRow = scaleSheet.find((row) => row.r === 2);
if (!legendRow) throw new Error("missing 01_척도문항 A2");

/** "매우 그렇다 100 / ... / 전혀 그렇지 않다 0" before the first " \u00b7 ". */
export const LIKERT_LEVELS: readonly { label: string; score: number }[] = (
  textCell(legendRow, 0).split(" \u00b7 ")[0] ?? ""
)
  .split(" / ")
  .map((part) => {
    const match = part.match(/^(.+) (\d+)$/);
    if (!match?.[1] || !match[2]) throw new Error(`bad legend ${part}`);
    return { label: match[1], score: Number(match[2]) };
  })
  .sort((a, b) => a.score - b.score);

export type ScaleItem<A> = {
  /** 01 C: item number, also the answer array index + 1 */
  readonly no: number;
  readonly area: A;
  readonly text: string;
  /** 01 F = Y */
  readonly reverse: boolean;
};

const itemsOf = <A extends string>(
  qid: string,
  track: string | null,
  areaOf: (label: string) => A,
): ScaleItem<A>[] =>
  scaleSheet
    .filter(
      (row) =>
        row.c[0] === qid &&
        typeof row.c[2] === "number" &&
        (track === null || row.c[1] === track),
    )
    .map((row) => ({
      no: numberCell(row, 2),
      area: areaOf(textCell(row, 3)),
      text: textCell(row, 4),
      reverse: row.c[5] === "Y",
    }));

const areaByLabel =
  <A extends P1Code | P2Code | MindCode>(codes: readonly A[]) =>
  (label: string): A => {
    const code = codes.find((c) => AREAS[c].label === label);
    if (!code) throw new Error(`no area labelled ${label}`);
    return code;
  };

const dimOf = (label: string): TempDim => {
  const dim = TEMP_DIMS.find((d) => label.startsWith(`${d} `));
  if (!dim) throw new Error(`no dimension in ${label}`);
  return dim;
};

export const SCALE_ITEMS = {
  q9: itemsOf("Q09", null, areaByLabel(P1_CODES)),
  q20: itemsOf("Q20", null, areaByLabel(MIND_CODES)),
  q11: byTrack((track) =>
    itemsOf("Q11", TRACK_NAMES[track], areaByLabel(P2_CODES[track])),
  ),
  q23: itemsOf("Q23", null, dimOf),
} as const;

/** 0..100 value of one answer, reversed (100 - value) for 역문항. */
export function scaleValue(
  items: readonly { no: number; reverse: boolean }[],
  no: number,
  answer: Likert,
): number {
  const item = items.find((i) => i.no === no);
  const level = LIKERT_LEVELS[answer];
  if (!item || !level)
    throw new Error(`no scale item ${no} or level ${answer}`);
  return item.reverse ? 100 - level.score : level.score;
}
