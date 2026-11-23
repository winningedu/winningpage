import { describe, expect, test } from "vitest";
import { EXAM_ITEM, EXAM_OPTION, judgeExamOps } from "./examOps.js";
import type { Likert } from "./likert.js";
import { OPTIONS } from "./options.js";
import { CALC_EXAMPLE } from "./testFixtures.js";

describe("judgeExamOps (21 C35)", () => {
  test("calc example: 8-15 대체로 and no 10번 15 pick is OK", () => {
    expect(judgeExamOps(CALC_EXAMPLE)).toBe("OK");
  });

  const withExam = (item: Likert, q10: readonly number[]) => ({
    ...CALC_EXAMPLE,
    q9: {
      ...CALC_EXAMPLE.q9,
      items: CALC_EXAMPLE.q9.items.map((v, i) => (i === 14 ? item : v)),
    },
    q10,
  });

  test("PDF p3: 8-15 별로 with 10번 15 picked is RISK", () => {
    expect(judgeExamOps(withExam(1, [15]))).toBe("RISK");
  });

  test("10번 15 alone makes RISK even with 8-15 매우", () => {
    expect(judgeExamOps(withExam(4, [3, 15]))).toBe("RISK");
  });

  test("8-15 보통 without the pick is MID", () => {
    expect(judgeExamOps(withExam(2, []))).toBe("MID");
  });

  test("reads 8-15 and 10번 15 (시험장 실수, 02 C20) from 21 C35", () => {
    expect(EXAM_ITEM).toBe(15);
    expect(EXAM_OPTION).toBe(15);
    expect(OPTIONS.q10.find((o) => o.ordinal === 15)?.area).toBe("P1_EXEC");
  });
});
