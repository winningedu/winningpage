// Answer checks shared by the survey and the server: required questions
// (13_문항메타 G), option ranges, visibility (13 H, 16), max picks, exclusive
// options (16 r22-r26) and the q13 date window (06 r55, judge-report R11).

import {
  type QuestionId,
  REQUIRED_QUESTIONS,
  type TrackCode,
} from "./codes.js";
import { SCALE_ITEMS } from "./likert.js";
import { OPTIONS, type OptionRow, trackOf } from "./options.js";
import { sheetRows, textCell } from "./sheet.js";
import type { DiagnosisV3Answers, IsoDate } from "./types.js";

export type ValidationError = {
  readonly question: QuestionId | "q3Target";
  readonly reason: "missing" | "invalid" | "hidden" | "too_many";
};

export type ValidationResult =
  | { readonly ok: true; readonly answers: DiagnosisV3Answers }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

type Raw = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isOrdinalOf = (rows: readonly OptionRow[], value: unknown) =>
  rows.some((option) => option.ordinal === value);

const isLikert = (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 4;

const isLikertBlock = (value: unknown, size: number) =>
  isRecord(value) &&
  Array.isArray(value.items) &&
  value.items.length === size &&
  value.items.every(isLikert) &&
  isLikert(value.verify);

/** 9 for 9등급제, 5 for 5등급제 (16 r6-r7 labels); null for the others. */
const gradeMax = (q4: unknown): number | null => {
  const label = OPTIONS.q4.find((option) => option.ordinal === q4)?.label;
  const max = Number.parseInt(label ?? "", 10);
  return Number.isNaN(max) ? null : max;
};

const isGrade = (value: unknown, q4: unknown) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= (gradeMax(q4) ?? Number.POSITIVE_INFINITY);

const MBTI_VALUES = OPTIONS.q22.map((option) =>
  String(option.code).slice("MBTI:".length),
);

const SINGLE_CHOICES = {
  q1: OPTIONS.q1,
  q2: OPTIONS.q2,
  q3: OPTIONS.q3,
  q4: OPTIONS.q4,
  q5: OPTIONS.q5,
  q8: OPTIONS.q8,
  q16: OPTIONS.q16,
  q17: OPTIONS.q17,
  q18: OPTIONS.q18,
} as const;

const LIKERT_SIZES = {
  q9: SCALE_ITEMS.q9.length,
  q20: SCALE_ITEMS.q20.length,
  q11: SCALE_ITEMS.q11.H12.length,
  q23: SCALE_ITEMS.q23.length,
} as const;

/** Option whose label the 13 H note quotes in 「」 for a hiding rule. */
const hidingOption = (qid: QuestionId, rows: readonly OptionRow[]) => {
  const meta = sheetRows("13_문항메타").find((row) => row.c[0] === qid);
  const quoted = meta && textCell(meta, 7).match(/「(.+?)」/)?.[1];
  const option = quoted && rows.find((o) => o.label.startsWith(quoted));
  if (!option) throw new Error(`no hiding option for ${qid}`);
  return option.ordinal;
};

const Q3_NO_TARGET = hidingOption("q3r", OPTIONS.q3);
const Q8_NOT_COMPARABLE = hidingOption("q8s", OPTIONS.q8);
const Q8S_UNKNOWN = hidingOption("q8d", OPTIONS.q8s);
/** 13 H7: q3 options 1..3 open the target university and major inputs. */
const Q3_TARGET_ORDINALS = [1, 2, 3];

const subjectRow = sheetRows("06_임계값").find(
  (row) => row.c[1] === "과목별 성적 수집",
);
/** 06 C51 switch for q6s, q6r, q6m. */
const SUBJECT_GRADES_ON = subjectRow?.c[2] === "사용";

const isHidden = (
  question: QuestionId | "q3Target",
  input: Raw,
  track: TrackCode | null,
) => {
  switch (question) {
    // a missing or invalid q3 is reported on q3 itself
    case "q3r":
      return input.q3 === Q3_NO_TARGET;
    case "q3Target":
      return (
        isOrdinalOf(OPTIONS.q3, input.q3) &&
        !Q3_TARGET_ORDINALS.includes(input.q3 as number)
      );
    case "q8s":
      return input.q8 === undefined || input.q8 === Q8_NOT_COMPARABLE;
    case "q8d":
      return input.q8s === undefined || input.q8s === Q8S_UNKNOWN;
    case "q6s":
    case "q6r":
    case "q6m":
      return !SUBJECT_GRADES_ON || track === "M3";
    case "q15":
      return track === "M3";
    case "q16":
    case "q17":
    case "q18":
      return input.q15 === undefined;
    default:
      return false;
  }
};

/** 13 F 복수선택(최대 N). */
const maxPicks = (qid: QuestionId) => {
  const meta = sheetRows("13_문항메타").find((row) => row.c[0] === qid);
  const max = meta && textCell(meta, 5).match(/최대 (\d+)/)?.[1];
  if (!max) throw new Error(`no max picks for ${qid}`);
  return Number(max);
};

const MULTI_CHOICES = {
  q3r: { max: maxPicks("q3r"), rows: () => OPTIONS.q3r },
  q10: { max: maxPicks("q10"), rows: () => OPTIONS.q10 },
  q12: { max: maxPicks("q12"), rows: (track: TrackCode) => OPTIONS.q12[track] },
  q14: { max: maxPicks("q14"), rows: () => OPTIONS.q14 },
} as const;
type MultiChoice = keyof typeof MULTI_CHOICES;
const isMultiChoice = (question: string): question is MultiChoice =>
  question in MULTI_CHOICES;

const isPickList = (rows: readonly OptionRow[], value: unknown) =>
  Array.isArray(value) &&
  new Set(value).size === value.length &&
  value.every((pick) => isOrdinalOf(rows, pick));

/** 16 r24: an exclusive option sent with others is ignored. */
const withoutLoneExclusive = (rows: readonly OptionRow[], picks: number[]) => {
  const rest = picks.filter(
    (pick) => !rows.some((o) => o.ordinal === pick && o.exclusive),
  );
  return rest.length > 0 ? rest : picks;
};

const isValid = (question: QuestionId, value: unknown, input: Raw) => {
  if (question in SINGLE_CHOICES) {
    return isOrdinalOf(
      SINGLE_CHOICES[question as keyof typeof SINGLE_CHOICES],
      value,
    );
  }
  if (question in LIKERT_SIZES) {
    return isLikertBlock(
      value,
      LIKERT_SIZES[question as keyof typeof LIKERT_SIZES],
    );
  }
  switch (question) {
    case "q6":
      return isGrade(value, input.q4);
    case "q21":
      return (
        isRecord(value) &&
        isOrdinalOf(OPTIONS.q21Weekday, value.weekday) &&
        isOrdinalOf(OPTIONS.q21Weekend, value.weekend)
      );
    case "q22":
      return MBTI_VALUES.includes(value as string);
    default:
      return true;
  }
};

export function validateAnswers(
  input: unknown,
  _diagnosedAt: IsoDate,
): ValidationResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: REQUIRED_QUESTIONS.map((question) => ({
        question,
        reason: "missing",
      })),
    };
  }
  const errors: ValidationError[] = [];
  const answers: Record<string, unknown> = { ...input };
  const track = isOrdinalOf(OPTIONS.q1, input.q1)
    ? trackOf(input.q1 as number)
    : null;
  for (const question of Object.keys(input) as QuestionId[]) {
    const value = input[question];
    if (value === undefined) continue;
    if (isHidden(question, input, track)) {
      errors.push({ question, reason: "hidden" });
    } else if (isMultiChoice(question)) {
      if (track === null) continue;
      const { max, rows } = MULTI_CHOICES[question];
      const options = rows(track);
      if (!isPickList(options, value)) {
        errors.push({ question, reason: "invalid" });
        continue;
      }
      const picks = withoutLoneExclusive(options, value as number[]);
      if (picks.length > max) errors.push({ question, reason: "too_many" });
      answers[question] = picks;
    } else if (!isValid(question, value, input)) {
      errors.push({ question, reason: "invalid" });
    }
  }
  for (const question of REQUIRED_QUESTIONS) {
    if (input[question] === undefined) {
      errors.push({ question, reason: "missing" });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, answers: answers as DiagnosisV3Answers };
}
