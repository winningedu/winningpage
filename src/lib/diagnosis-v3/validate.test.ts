import { describe, expect, test } from "vitest";
import { REQUIRED_QUESTIONS } from "./codes.js";
import { CALC_EXAMPLE, validAnswers } from "./testFixtures.js";
import type { DiagnosisV3Answers } from "./types.js";
import { validateAnswers } from "./validate.js";

const DAY1 = "2026-11-09";

const H12 = validAnswers("H12");
const errorsOf = (answers: unknown) => {
  const result = validateAnswers(answers, DAY1);
  return result.ok ? [] : result.errors;
};
const without = (answers: DiagnosisV3Answers, key: string) =>
  Object.fromEntries(Object.entries(answers).filter(([k]) => k !== key));

describe("validateAnswers", () => {
  test.each(["H12", "H3", "M3"] as const)("accepts the %s fixture", (track) => {
    const answers = validAnswers(track);
    expect(validateAnswers(answers, DAY1)).toEqual({ ok: true, answers });
  });

  test("accepts the 계산 예시 student", () => {
    expect(validateAnswers(CALC_EXAMPLE, DAY1).ok).toBe(true);
  });
});

describe("required questions (13_문항메타 G)", () => {
  test.each(REQUIRED_QUESTIONS)("%s missing is reported", (question) => {
    expect(errorsOf(without(H12, question))).toEqual([
      { question, reason: "missing" },
    ]);
  });

  test("a non-object payload is rejected", () => {
    expect(validateAnswers(null, DAY1).ok).toBe(false);
  });
});
