// 7p admission band (spec r78-r81, score sheet 08, 16 r10-r17). Pure TS: every
// number is read from the sheets at module load.

import { toNineGrade } from "./gradeConvert.js";
import { OPTIONS } from "./options.js";
import { roundHalfUpInt } from "./round.js";
import { numberCell, sheetRows, textCell } from "./sheet.js";
import type {
  AdmissionBand,
  DiagnosisV3Answers,
  DiagnosisV3Context,
  DiagnosisV3Scores,
} from "./types.js";

type Computed = Extract<
  DiagnosisV3Scores["admission"],
  { readonly status: "COMPUTED" }
>;

export type AdmissionResult =
  | Exclude<DiagnosisV3Scores["admission"], { readonly status: "COMPUTED" }>
  | Computed;

const SHEET_08 = sheetRows("08_합격가능성");

/** Signed %p cell such as "+5%p" or "-15%p" (the sheet may use U+2212). */
const percentPoints = (text: string): number => {
  const match = /([+-]?)(\d+)%p/.exec(text.replace(/\u2212/g, "-"));
  if (!match) throw new Error(`08 not a %p value: ${text}`);
  return Number(`${match[1]}${match[2]}`);
};

const rowAt = (r: number) => {
  const row = SHEET_08.find((candidate) => candidate.r === r);
  if (!row) throw new Error(`missing 08 r${r}`);
  return row;
};

/** 08 r11: 기본 구간 중앙값 in band order 안정, 적정, 소신, 위험. */
const BASE_MIDPOINT: readonly number[] = textCell(rowAt(11), 2)
  .split(" / ")
  .map((part) => Number(/\d+/.exec(part)?.[0]));

/** 08 r13: 범위 제한 "10~90". */
const [CLAMP_LOW, CLAMP_HIGH] = textCell(rowAt(13), 2).split("~").map(Number);

/** 08 r14: "70 이상 안정 / 50 이상 적정 / 30 이상 소신 / 그 외 위험". */
const RELABEL_MIN: readonly number[] = [
  ...textCell(rowAt(14), 2).matchAll(/(\d+) 이상/g),
].map((match) => Number(match[1]));

/** 08 r9: the 0.30 in "70%컷 + 0.30", kept in thousandths to stay exact. */
const MARGIN_MILLI = Math.round(
  Number(/70%컷 \+ (\d+\.\d+)/.exec(textCell(rowAt(9), 3))?.[1]) * 1000,
);

/** ordinal to %p of one q16, q17 or q18 option (08 r16-r36, key = 14 label). */
const optionDeltas = (key: "Q16" | "Q17" | "Q18") => {
  const options = OPTIONS[key.toLowerCase() as "q16" | "q17" | "q18"];
  return new Map(
    options.map((option) => {
      const row = SHEET_08.find(
        (candidate) =>
          candidate.c[0] === key && candidate.c[1] === option.label,
      );
      if (!row) throw new Error(`08 has no ${key} row for ${option.label}`);
      return [option.ordinal, percentPoints(textCell(row, 2))] as const;
    }),
  );
};

const Q16_DELTA = optionDeltas("Q16");
const Q17_DELTA = optionDeltas("Q17");
const Q18_DELTA = optionDeltas("Q18");

const delta = (
  table: ReadonlyMap<number, number>,
  ordinal: number | undefined,
) => (ordinal === undefined ? 0 : (table.get(ordinal) ?? 0));

const toMilli = (grade: number) => Math.round(grade * 1000);

const bandOf = (mine: number, cut70: number): AdmissionBand =>
  mine <= cut70 - MARGIN_MILLI
    ? 1
    : mine <= cut70
      ? 2
      : mine <= cut70 + MARGIN_MILLI
        ? 3
        : 4;

export function computeAdmission(
  answers: DiagnosisV3Answers,
  context: DiagnosisV3Context,
): AdmissionResult {
  const grade9 = toNineGrade(answers.q4, answers.q6) as number;
  const cut70 = context.admission?.cut70 as number;
  const baseBand = bandOf(toMilli(grade9), toMilli(cut70));
  const raw =
    (BASE_MIDPOINT[baseBand - 1] as number) +
    delta(Q16_DELTA, answers.q16) +
    delta(Q17_DELTA, answers.q17) +
    delta(Q18_DELTA, answers.q18);
  const probability = Math.min(
    CLAMP_HIGH as number,
    Math.max(CLAMP_LOW as number, raw),
  );
  const relabel = RELABEL_MIN.findIndex((min) => probability >= min);
  const band = (relabel === -1 ? 4 : relabel + 1) as AdmissionBand;
  return {
    status: "COMPUTED",
    mode: "BASIC",
    grade9,
    baseBand,
    probability,
    probabilityLow: probability,
    probabilityHigh: probability,
    band,
  };
}
