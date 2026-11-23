// MBTI block (spec rows 111-113, score sheet 19_MBTI데이터, copy sheet 14).
// Pure TS: sheet constants are read at module load, text lives in COPY_TEXT.

import { roundHalfUp1 } from "./round.js";
import { numberCell, sheetRows, textCell } from "./sheet.js";
import type { DiagnosisV3Scores, MbtiType } from "./types.js";

const mbtiSheet = sheetRows("19_MBTI데이터");
const mbtiRow = (r: number) => {
  const row = mbtiSheet.find((candidate) => candidate.r === r);
  if (!row) throw new Error(`missing 19_MBTI데이터 r${r}`);
  return row;
};

/** First integer after a marker in a prose cell, e.g. "n ÷ 2,042" or "60 미만". */
const proseNumber = (text: string, pattern: RegExp): number => {
  const match = text.match(pattern);
  if (!match?.[1]) throw new Error(`no number in "${text}"`);
  return Number(match[1].replace(/,/g, ""));
};

// 19 B23: "표본 n ÷ 2,042 × 100, 소수점 1자리".
const STUDY_TOTAL = proseNumber(textCell(mbtiRow(23), 1), /÷ ([\d,]+)/);
// 19 B25: "표본 n이 60 미만이면 MBTI_SMALLN 문구 추가".
const SMALL_SAMPLE_BELOW = proseNumber(textCell(mbtiRow(25), 1), /(\d+) 미만/);

// 19 r5-r20: type, 표본 n, then five factor counts (C-G, factor numbers 1-5).
const TYPE_ROWS = new Map(
  mbtiSheet
    .filter((row) => row.r >= 5 && row.r <= 20)
    .map((row) => [
      textCell(row, 0) as MbtiType,
      {
        n: numberCell(row, 1),
        factors: [2, 3, 4, 5, 6].map((col) => numberCell(row, col)),
      },
    ]),
);

export type MbtiScore = NonNullable<DiagnosisV3Scores["mbti"]>;

/** NONE or no answer gives null (14 r171, spec row 113). */
export function scoreMbti(
  type: MbtiType | "NONE" | undefined,
): MbtiScore | null {
  if (type === undefined || type === "NONE") return null;
  const row = TYPE_ROWS.get(type);
  if (!row) throw new Error(`no 19_MBTI데이터 row for ${type}`);
  const top = Math.max(...row.factors);
  return {
    type,
    sampleN: row.n,
    sharePct: roundHalfUp1(row.n * 100, STUDY_TOTAL),
    topFactors: row.factors.flatMap((count, i) =>
      count === top ? [i + 1] : [],
    ),
    smallSample: row.n < SMALL_SAMPLE_BELOW,
  };
}
