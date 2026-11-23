// Answer option rows per question. An answer carries the option's 1-based
// ordinal (14_선택지코드 B column). 14 codes are not unique per question
// (q10 has three AREA:학습 수행 rows, q3 two SCORE:70 rows), so the ordinal is
// the only stable key; the code is looked up from the row. q2, q4 and q5 have
// no 14 rows: their ordinals follow 13 H6 (q2) and 16 r6-r9 (q4), r11-r17 (q5).

import {
  AREAS,
  type AreaCode,
  byTrack,
  MIND_CODES,
  P1_CODES,
  P2_CODES,
  TRACK_CODES,
  TRACK_NAMES,
  type TrackCode,
} from "./codes.js";
import { numberCell, sheetRows, textCell } from "./sheet.js";

export type OptionRow = {
  readonly ordinal: number;
  readonly label: string;
  /** 14 D code; for q4 and q5 the 16 C value; null for q2 */
  readonly code: string | null;
  /** q10 and q12: the area an AREA: code maps to */
  readonly area?: AreaCode;
  /** 14 code EXCLUSIVE */
  readonly exclusive: boolean;
};

const choiceRows = sheetRows("14_선택지코드").filter(
  (row) => typeof row.c[1] === "number",
);

const choicesOf = (key: string, areaCodes: readonly AreaCode[] = []) =>
  choiceRows
    .filter((row) => row.c[0] === key)
    .map((row): OptionRow => {
      const code = textCell(row, 3);
      const option = {
        ordinal: numberCell(row, 1),
        label: textCell(row, 2),
        code,
        exclusive: code === "EXCLUSIVE",
      };
      if (!code.startsWith("AREA:")) return option;
      const label = code.slice("AREA:".length);
      const area = areaCodes.find((c) => AREAS[c].label === label);
      if (!area) throw new Error(`no area for ${key} ${code}`);
      return { ...option, area };
    });

const ruleRows = (key: string) =>
  sheetRows("16_문항규칙")
    .filter((row) => row.c[0] === key)
    .map(
      (row, index): OptionRow => ({
        ordinal: index + 1,
        label: textCell(row, 1),
        code: textCell(row, 2),
        exclusive: false,
      }),
    );

const schoolTypes = () => {
  const meta = sheetRows("13_문항메타").find((row) => row.c[0] === "q2");
  if (!meta) throw new Error("missing 13 q2 row");
  const list = textCell(meta, 7).split("선택지: ")[1];
  if (!list) throw new Error("missing 13 q2 option list");
  return list.split(" / ").map(
    (label, index): OptionRow => ({
      ordinal: index + 1,
      label,
      code: null,
      exclusive: false,
    }),
  );
};

const q10Areas: readonly AreaCode[] = [...P1_CODES, ...MIND_CODES];

export const OPTIONS = {
  q1: choicesOf("q1"),
  q2: schoolTypes(),
  q3: choicesOf("q3"),
  q3r: choicesOf("q3r"),
  q4: ruleRows("Q04"),
  q5: ruleRows("Q05"),
  q8: choicesOf("q8"),
  q8s: choicesOf("q8s"),
  q8d: choicesOf("q8d"),
  q10: choicesOf("q10", q10Areas),
  q12: byTrack((track) =>
    choicesOf(`q12/${TRACK_NAMES[track]}`, P2_CODES[track]),
  ),
  q13: choicesOf("q13"),
  q14: choicesOf("q14"),
  q15: choicesOf("q15"),
  q16: choicesOf("q16"),
  q17: choicesOf("q17"),
  q18: choicesOf("q18"),
  q21Weekday: choicesOf("q21/평일"),
  q21Weekend: choicesOf("q21/주말"),
  q22: choicesOf("q22"),
} as const;

/** Track of a q1 ordinal, from its TRACK:<name>[|sub] code. */
export function trackOf(grade: number): TrackCode {
  const code = OPTIONS.q1.find((o) => o.ordinal === grade)?.code;
  const name = code?.slice("TRACK:".length).split("|")[0];
  const track = TRACK_CODES.find((t) => TRACK_NAMES[t] === name);
  if (!track) throw new Error(`no track for q1 ${grade}`);
  return track;
}
