import { describe, expect, test } from "vitest";
import { scoreMbti } from "./mbti.js";

describe("MBTI scores (19_MBTI데이터, spec row 111)", () => {
  test("PDF p8 ESTJ: 93 people, 4.6%, top factor 수업태도 (2)", () => {
    expect(scoreMbti("ESTJ")).toEqual({
      type: "ESTJ",
      sampleN: 93,
      sharePct: 4.6,
      topFactors: [2],
      smallSample: false,
    });
  });

  test("ties keep every maximum factor", () => {
    expect(scoreMbti("ISTP")?.topFactors).toEqual([2, 5]);
    expect(scoreMbti("ESTP")?.topFactors).toEqual([2, 5]);
    expect(scoreMbti("ENFP")?.topFactors).toEqual([5]);
  });

  test("a sample under 60 is flagged: INTJ 39, INFJ 47, ENTJ 38", () => {
    expect(scoreMbti("INTJ")).toMatchObject({ sampleN: 39, smallSample: true });
    expect(scoreMbti("INFJ")?.smallSample).toBe(true);
    expect(scoreMbti("ENTJ")?.smallSample).toBe(true);
    expect(scoreMbti("INFP")?.smallSample).toBe(false);
  });

  test("NONE and no answer give no MBTI block", () => {
    expect(scoreMbti("NONE")).toBeNull();
    expect(scoreMbti(undefined)).toBeNull();
  });

  test("the shares are n / 2,042 to one decimal", () => {
    expect(scoreMbti("ENFP")?.sharePct).toBe(15.8);
    expect(scoreMbti("ESFP")?.sharePct).toBe(15.1);
    expect(scoreMbti("ENTJ")?.sharePct).toBe(1.9);
  });
});
