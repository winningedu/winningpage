// Stable code constants for the v3 engine. Code lists are typed here so the
// compiler knows every key; codes.test.ts asserts each list equals the sheet.
// Labels, weights and option rows are read from SCORE_SHEETS at module load.

import { numberCell, sheetRows, textCell } from "./sheet.js";

export const TRACK_CODES = ["M3", "H12", "H3"] as const;
export type TrackCode = (typeof TRACK_CODES)[number];

// 05_영역설정 C5-C11, display order.
export const P1_CODES = [
  "P1_GOAL",
  "P1_PRIO",
  "P1_PLAN",
  "P1_EXEC",
  "P1_LOG",
  "P1_PATT",
  "P1_ADJ",
] as const;
export type P1Code = (typeof P1_CODES)[number];

// 05_영역설정 C12-C29, display order per track.
export const P2_CODES = {
  H12: ["H12_SUBJ", "H12_PERF", "H12_DEEP", "H12_LINK", "H12_REC", "H12_STRA"],
  H3: ["H3_GPA", "H3_CSAT", "H3_FIT", "H3_TYPE", "H3_REC", "H3_APPLY"],
  M3: ["M3_KOR", "M3_MATH", "M3_ENG", "M3_HABIT", "M3_PATH", "M3_PREP"],
} as const;
export type P2Code = (typeof P2_CODES)[TrackCode][number];

// 05_영역설정 C30-C32.
export const MIND_CODES = ["MIND_EFF", "MIND_GROW", "MIND_RECV"] as const;
export type MindCode = (typeof MIND_CODES)[number];

export type AreaCode = P1Code | P2Code | MindCode;

export type AreaInfo = {
  readonly code: AreaCode;
  /** 05 B: area name, also the label used by 14 AREA: codes */
  readonly label: string;
  /** 05 A: sheet group name (PAGE1 공통, a track name, MIND 공통) */
  readonly group: string;
  /** 05 D: aux component key (Q03_goal, Q10, Q12, 없음) */
  readonly aux: string;
  /** 05 E: weight in percent */
  readonly weight: number;
};

const areaRows = sheetRows("05_영역설정").filter((row) =>
  /^(P1|H12|H3|M3|MIND)_/.test(String(row.c[2])),
);

export const AREAS = Object.fromEntries(
  areaRows.map((row) => {
    const code = textCell(row, 2) as AreaCode;
    const info: AreaInfo = {
      code,
      label: textCell(row, 1),
      group: textCell(row, 0),
      aux: textCell(row, 3),
      weight: numberCell(row, 4),
    };
    return [code, info];
  }),
) as Readonly<Record<AreaCode, AreaInfo>>;

/** Sheet track name per track code, read from the 05 group column. */
export const TRACK_NAMES = Object.fromEntries(
  TRACK_CODES.map((track) => [track, AREAS[P2_CODES[track][0]].group]),
) as Readonly<Record<TrackCode, string>>;
