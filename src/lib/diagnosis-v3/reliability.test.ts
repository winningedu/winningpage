import { describe, expect, test } from "vitest";
import type { Likert } from "./likert.js";
import { scoreReliability } from "./reliability.js";
import { CALC_EXAMPLE } from "./testFixtures.js";
import type { DiagnosisV3Answers } from "./types.js";

describe("response reliability (17_신뢰도, spec No 42-47)", () => {
  test("계산 예시 A11: no flag, 학습진단 양호, 기질 정상", () => {
    expect(scoreReliability(CALC_EXAMPLE)).toEqual({
      flags: {
        F1: false,
        F2: false,
        F3: false,
        F4: false,
        F5: false,
        F6: false,
      },
      diagnosis: "GOOD",
      temperament: "NORMAL",
    });
  });

  const withVerify = (
    q: "q9" | "q11" | "q20" | "q23",
    verify: Likert,
  ): DiagnosisV3Answers => ({
    ...CALC_EXAMPLE,
    [q]: { ...CALC_EXAMPLE[q], verify },
  });

  test.each([
    ["F1", "q9", 4, true],
    ["F1", "q9", 3, true],
    ["F1", "q9", 2, false],
    ["F2", "q11", 4, true],
    ["F2", "q11", 3, true],
    ["F2", "q11", 1, false],
    ["F3", "q20", 2, false],
    ["F3", "q20", 3, true],
    ["F3", "q20", 0, true],
    ["F4", "q23", 3, false],
    ["F4", "q23", 4, true],
    ["F4", "q23", 2, true],
  ] as const)(
    "%s from %s answer %d is %s (17 D6-D9)",
    (flag, q, verify, on) => {
      expect(scoreReliability(withVerify(q, verify)).flags[flag]).toBe(on);
    },
  );

  test("one of F1..F3 is 보통 (17 C15), two are 응답 단순 (17 C14)", () => {
    expect(scoreReliability(withVerify("q9", 4)).diagnosis).toBe("MID");
    const two = {
      ...withVerify("q9", 4),
      q20: { ...CALC_EXAMPLE.q20, verify: 0 as const },
    };
    expect(scoreReliability(two).diagnosis).toBe("SIMPLE");
  });

  test("F4 alone is 기질 주의 and leaves 학습진단 양호 (17 C17)", () => {
    const result = scoreReliability(withVerify("q23", 4));
    expect(result.temperament).toBe("CAUTION");
    expect(result.diagnosis).toBe("GOOD");
  });
});
