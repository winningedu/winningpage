import { describe, expect, test } from "vitest";
import { REQUIRED_QUESTIONS } from "./codes.js";
import { CALC_EXAMPLE, validAnswers } from "./testFixtures.js";
import type { DiagnosisV3Answers } from "./types.js";
import { gradeBoundsOf, MAX_TEXT_LENGTH, validateAnswers } from "./validate.js";

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

describe("multiple choice (13 F max, 16 r22-r26 exclusive)", () => {
  test.each([
    ["q3r", [1, 2, 3]],
    ["q10", [1, 2, 3, 4]],
    ["q12", [1, 2, 3, 4]],
    ["q14", [1, 2, 3]],
  ])("%s over the 13 F maximum is too_many", (question, picks) => {
    expect(errorsOf({ ...H12, [question]: picks })).toEqual([
      { question, reason: "too_many" },
    ]);
  });

  test.each([
    ["q10", [17]],
    ["q10", [1, 1]],
    ["q12", [14]],
    ["q14", "2"],
    ["q3r", [0]],
  ])("%s = %j is invalid", (question, picks) => {
    expect(errorsOf({ ...H12, [question]: picks })).toEqual([
      { question, reason: "invalid" },
    ]);
  });

  test("an exclusive option alone is kept", () => {
    const result = validateAnswers({ ...H12, q10: [16], q12: [13] }, DAY1);
    expect(result.ok && [result.answers.q10, result.answers.q12]).toEqual([
      [16],
      [13],
    ]);
  });

  test("an exclusive option sent with others is dropped (16 r24)", () => {
    const result = validateAnswers(
      { ...H12, q3r: [7, 1], q10: [1, 2, 3, 16], q12: [13, 5] },
      DAY1,
    );
    expect(
      result.ok && [result.answers.q3r, result.answers.q10, result.answers.q12],
    ).toEqual([[1], [1, 2, 3], [5]]);
  });
});

describe("q13 schedule (13 r24, 06 C55 window, Day 1 = diagnosedAt)", () => {
  const event = (date: string, kind = "EXAM") => ({ kind, date });

  test("Day 1 and Day 42 are accepted", () => {
    expect(
      errorsOf({ ...H12, q13: [event("2026-11-09"), event("2026-12-20")] }),
    ).toEqual([]);
  });

  test.each([
    [[event("2026-11-08")]],
    [[event("2026-12-21")]],
    [[event("2026-13-01")]],
    [[event("2026/11/20")]],
    [[event("2026-11-20", "NONE")]],
    [[{ ...event("2026-11-20"), subject: 3 }]],
    [[]],
    ["LATER"],
  ])("q13 = %j is invalid", (q13) => {
    expect(errorsOf({ ...H12, q13 })).toEqual([
      { question: "q13", reason: "invalid" },
    ]);
  });

  test("the exclusive choices are plain strings", () => {
    expect(errorsOf({ ...H12, q13: "NONE" })).toEqual([]);
    expect(errorsOf({ ...H12, q13: "UNKNOWN" })).toEqual([]);
  });

  test("more than 3 events is too_many", () => {
    const four = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
    expect(errorsOf({ ...H12, q13: four.map((d) => event(d)) })).toEqual([
      { question: "q13", reason: "too_many" },
    ]);
  });
});

describe("other optional values", () => {
  test.each([
    ["q3Target", { university: 3 }],
    ["q3Target", "연세대"],
    ["q6s", { KOR: 0 }],
    ["q6s", { KOREAN: 2 }],
    ["q6r", -1],
    ["q6m", { month: 2, grades: { KOR: 3 } }],
    ["q6m", { month: 9, grades: { HIST: 10 } }],
    ["q15", { ...H12.q15, universityKey: "" }],
    ["q15", { universityKey: "yonsei" }],
  ])("%s = %j is invalid", (question, value) => {
    expect(errorsOf({ ...H12, [question]: value })).toEqual([
      { question, reason: "invalid" },
    ]);
  });

  test("q8s and q8d must be their option ordinals", () => {
    expect(errorsOf({ ...H12, q8: 4, q8s: 8 })).toEqual([
      { question: "q8s", reason: "invalid" },
    ]);
    expect(errorsOf({ ...H12, q8: 4, q8s: 1, q8d: 4 })).toEqual([
      { question: "q8d", reason: "invalid" },
    ]);
  });

  test("q6m grades are on the 9-grade mock scale", () => {
    expect(
      errorsOf({ ...H12, q6m: { month: 11, grades: { HIST: 9, SCI: 1 } } }),
    ).toEqual([]);
  });
});

describe("unknown keys (review W1, W2)", () => {
  const unknown = [{ question: "unknown", reason: "invalid" }];

  test("an unknown top-level key is rejected", () => {
    expect(errorsOf({ ...H12, evil: "x".repeat(400_000) })).toEqual(unknown);
  });

  test.each(["constructor", "toString", "hasOwnProperty"])(
    "the inherited name %s is rejected, not thrown on",
    (key) => {
      expect(errorsOf({ ...H12, [key]: 1 })).toEqual(unknown);
    },
  );

  test("a JSON __proto__ key is rejected", () => {
    const payload = JSON.parse(`{"__proto__": {"x": 1}}`);
    expect(
      errorsOf({ ...H12, ...Object.fromEntries(Object.entries(payload)) }),
    ).toEqual(unknown);
  });
});

describe("nested unknown keys (review W1)", () => {
  test.each([
    ["q9", () => ({ ...H12.q9, evil: 1 })],
    ["q13", () => [{ kind: "EXAM", date: "2026-11-20", evil: 1 }]],
    ["q3Target", () => ({ university: "a", major: "b", evil: "c" })],
    ["q15", () => ({ ...H12.q15, evil: "c" })],
    ["q21", () => ({ weekday: 1, weekend: 1, evil: 1 })],
    ["q6m", () => ({ month: 9, grades: { KOR: 3 }, evil: 1 })],
  ])("%s with an extra key is invalid", (question, value) => {
    expect(errorsOf({ ...H12, [question]: value() })).toEqual([
      { question, reason: "invalid" },
    ]);
  });
});

describe("text length and duplicate events (review W1)", () => {
  const long = "x".repeat(MAX_TEXT_LENGTH + 1);

  test("a q13 subject over the cap is invalid, at the cap is valid", () => {
    const event = (subject: string) => [
      { kind: "EXAM", date: "2026-11-20", subject },
    ];
    expect(
      errorsOf({ ...H12, q13: event("x".repeat(MAX_TEXT_LENGTH)) }),
    ).toEqual([]);
    expect(errorsOf({ ...H12, q13: event(long) })).toEqual([
      { question: "q13", reason: "invalid" },
    ]);
  });

  test.each(["university", "major"])(
    "a q3Target %s over the cap is invalid",
    (field) => {
      expect(errorsOf({ ...H12, q3Target: { [field]: long } })).toEqual([
        { question: "q3Target", reason: "invalid" },
      ]);
    },
  );

  test("the same kind on the same date twice is invalid", () => {
    const same = { kind: "EXAM", date: "2026-11-20" };
    expect(
      errorsOf({ ...H12, q13: [same, { ...same, subject: "국어" }] }),
    ).toEqual([{ question: "q13", reason: "invalid" }]);
    expect(
      errorsOf({ ...H12, q13: [same, { kind: "PERF", date: "2026-11-20" }] }),
    ).toEqual([]);
  });
});

describe("grade ranges per q4 (review W3, 16 r6-r9, 12 B5)", () => {
  test("bounds come from the 16 labels and the 12 원점수 구간", () => {
    expect(gradeBoundsOf(1)).toEqual({ min: 1, max: 9 }); // 16 r6
    expect(gradeBoundsOf(2)).toEqual({ min: 1, max: 5 }); // 16 r7
    expect(gradeBoundsOf(3)).toEqual({ min: 0, max: 100 }); // 12 B5 "90 ~ 100점"
    expect(gradeBoundsOf(4)).toEqual({ min: 1, max: 9 }); // 16 r9 환산 없음
  });

  test.each([
    [1, 0.01],
    [1, 9.01],
    [2, 0.99],
    [2, 5.01],
    [3, -1],
    [3, 100.5],
    [3, 1e9],
    [4, 0.5],
    [4, 10],
  ])("q4 %s rejects q6 = %s, q6r and q6s too", (q4, grade) => {
    const invalid = (question: string) => ({ question, reason: "invalid" });
    expect(errorsOf({ ...H12, q4, q6: grade })).toEqual([invalid("q6")]);
    expect(errorsOf({ ...H12, q4, q6r: grade })).toEqual([invalid("q6r")]);
    expect(errorsOf({ ...H12, q4, q6s: { KOR: grade } })).toEqual([
      invalid("q6s"),
    ]);
  });

  test.each([
    [1, 1],
    [1, 9],
    [2, 5],
    [3, 0],
    [3, 95.5],
    [3, 100],
    [4, 9],
  ])("q4 %s accepts q6 = %s", (q4, grade) => {
    expect(errorsOf({ ...H12, q4, q6: grade })).toEqual([]);
  });

  test.each([2.5, 0, 10, 1e9, Number.NaN])(
    "a mock grade of %s is invalid, grades are integers 1..9",
    (grade) => {
      expect(
        errorsOf({ ...H12, q6m: { month: 9, grades: { KOR: grade } } }),
      ).toEqual([{ question: "q6m", reason: "invalid" }]);
    },
  );
});
