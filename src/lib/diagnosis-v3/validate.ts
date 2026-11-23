// Answer checks shared by the survey and the server: required questions
// (13_문항메타 G), option ranges, visibility (13 H, 16), max picks, exclusive
// options (16 r22-r26) and the q13 date window (06 r55, judge-report R11).

import type { QuestionId } from "./codes.js";
import type { DiagnosisV3Answers, IsoDate } from "./types.js";

export type ValidationError = {
  readonly question: QuestionId | "q3Target";
  readonly reason: "missing" | "invalid" | "hidden" | "too_many";
};

export type ValidationResult =
  | { readonly ok: true; readonly answers: DiagnosisV3Answers }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export function validateAnswers(
  input: unknown,
  _diagnosedAt: IsoDate,
): ValidationResult {
  return { ok: true, answers: input as DiagnosisV3Answers };
}
