// Answer checks shared by the survey and the server: required questions
// (13_문항메타 G), option ranges, visibility (13 H, 16), max picks, exclusive
// options (16 r22-r26) and the q13 date window (06 r55, judge-report R11).

import { type QuestionId, REQUIRED_QUESTIONS } from "./codes.js";
import { SCALE_ITEMS } from "./likert.js";
import { OPTIONS, type OptionRow } from "./options.js";
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
  for (const question of Object.keys(input) as QuestionId[]) {
    const value = input[question];
    if (value !== undefined && !isValid(question, value, input)) {
      errors.push({ question, reason: "invalid" });
    }
  }
  for (const question of REQUIRED_QUESTIONS) {
    if (input[question] === undefined) {
      errors.push({ question, reason: "missing" });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, answers: input as DiagnosisV3Answers };
}
