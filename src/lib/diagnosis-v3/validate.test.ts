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

describe("option values", () => {
  test.each([
    ["q1", 7],
    ["q1", "3"],
    ["q2", 9],
    ["q3", 0],
    ["q4", 5],
    ["q5", 8],
    ["q8", 7],
    ["q16", 6],
    ["q17", 8],
    ["q18", 2.5],
  ])("%s = %s is invalid", (question, value) => {
    expect(errorsOf({ ...H12, [question]: value })).toEqual([
      { question, reason: "invalid" },
    ]);
  });

  test.each([
    ["q9", { items: H12.q9.items.slice(1), verify: 1 }],
    ["q9", { items: H12.q9.items, verify: 5 }],
    ["q20", { items: [...H12.q20.items, 2], verify: 2 }],
    ["q11", { items: H12.q11.items.map(() => -1), verify: 1 }],
    ["q23", { items: H12.q23.items, verify: null }],
    ["q23", [1, 2, 3]],
  ])("likert block %s with a bad shape is invalid", (question, value) => {
    expect(errorsOf({ ...H12, [question]: value })).toEqual([
      { question, reason: "invalid" },
    ]);
  });

  test.each([{ weekday: 6, weekend: 1 }, { weekday: 1 }, "1~2시간"])(
    "q21 = %j is invalid",
    (value) => {
      expect(errorsOf({ ...H12, q21: value })).toEqual([
        { question: "q21", reason: "invalid" },
      ]);
    },
  );

  test("q6 must be a positive grade within the q4 system", () => {
    expect(errorsOf({ ...H12, q6: 0 })).toEqual([
      { question: "q6", reason: "invalid" },
    ]);
    expect(errorsOf({ ...H12, q4: 2, q6: 5.5 })).toEqual([
      { question: "q6", reason: "invalid" },
    ]);
    expect(errorsOf({ ...H12, q4: 1, q6: 5.5 })).toEqual([]);
    expect(errorsOf({ ...H12, q6: "1.4" })).toEqual([
      { question: "q6", reason: "invalid" },
    ]);
  });

  test("q22 is a 14 MBTI code or NONE", () => {
    expect(errorsOf({ ...H12, q22: "ENFP" })).toEqual([]);
    expect(errorsOf({ ...H12, q22: "NONE" })).toEqual([]);
    expect(errorsOf({ ...H12, q22: "ABCD" })).toEqual([
      { question: "q22", reason: "invalid" },
    ]);
  });
});

describe("visibility (13 H, 16 r33-r35)", () => {
  const M3 = validAnswers("M3");
  const hidden = (question: string) => [{ question, reason: "hidden" }];

  test("q3r and the target inputs follow q3", () => {
    expect(errorsOf({ ...H12, q3: 6, q3r: [1] })).toEqual([
      ...hidden("q3Target"),
      ...hidden("q3r"),
    ]);
    expect(errorsOf({ ...without(H12, "q3Target"), q3: 5, q3r: [1] })).toEqual(
      [],
    );
    expect(errorsOf({ ...H12, q3: 4 })).toEqual(hidden("q3Target"));
    expect(errorsOf({ ...H12, q3: 3 })).toEqual([]);
  });

  test("q8s needs a comparable q8, q8d needs a known q8s", () => {
    expect(errorsOf({ ...H12, q8s: 1 })).toEqual(hidden("q8s"));
    expect(errorsOf({ ...H12, q8: 6, q8s: 1 })).toEqual(hidden("q8s"));
    expect(errorsOf({ ...H12, q8: 4, q8s: 1, q8d: 2 })).toEqual([]);
    expect(errorsOf({ ...H12, q8: 4, q8s: 7, q8d: 2 })).toEqual(hidden("q8d"));
    expect(errorsOf({ ...H12, q8: 4, q8d: 2 })).toEqual(hidden("q8d"));
  });

  test("subject grades are hidden for M3 only (06 C51 is 사용)", () => {
    const grades = {
      q6s: { KOR: 2 },
      q6r: 2.1,
      q6m: { month: 9, grades: { KOR: 3 } },
    };
    expect(errorsOf({ ...H12, ...grades })).toEqual([]);
    expect(errorsOf({ ...M3, ...grades })).toEqual([
      ...hidden("q6s"),
      ...hidden("q6r"),
      ...hidden("q6m"),
    ]);
  });

  test("q15 is hidden for M3 and q16..q18 need q15", () => {
    expect(errorsOf({ ...M3, q15: H12.q15 })).toEqual(hidden("q15"));
    expect(errorsOf(without(H12, "q15"))).toEqual([
      ...hidden("q16"),
      ...hidden("q17"),
      ...hidden("q18"),
    ]);
  });
});
