import { describe, expect, test } from "vitest";
import { mbtiLinks, scoreMbti } from "./mbti.js";
import { sheetRows } from "./sheet.js";

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

describe("links to the diagnosis scores (22 r82, 14 MBTI_LINK_*)", () => {
  const scores = (plan: number, recv: number, patt: number) => ({
    P1_PLAN: plan,
    MIND_RECV: recv,
    P1_PATT: patt,
  });

  test("PDF p8 ESTJ with 계획 수립 65 and 패턴 분석 74: J low, T high", () => {
    expect(mbtiLinks("ESTJ", scores(65, 50, 74))).toEqual([
      { id: "MBTI_LINK_J_LOW", score: 65 },
      { id: "MBTI_LINK_T_HIGH", score: 74 },
    ]);
  });

  test("P and F types use 계획 수립 and 불안 회복: ENFP", () => {
    expect(mbtiLinks("ENFP", scores(70, 59, 0))).toEqual([
      { id: "MBTI_LINK_P_HIGH", score: 70 },
      { id: "MBTI_LINK_F_LOW", score: 59 },
    ]);
    expect(mbtiLinks("ENFP", scores(69, 60, 0))).toEqual([
      { id: "MBTI_LINK_P_LOW", score: 69 },
      { id: "MBTI_LINK_F_HIGH", score: 60 },
    ]);
  });

  test("T switches at 패턴 분석 70", () => {
    expect(mbtiLinks("ISTJ", scores(0, 0, 69))[1]?.id).toBe("MBTI_LINK_T_LOW");
    expect(mbtiLinks("ISTJ", scores(0, 0, 70))[1]?.id).toBe("MBTI_LINK_T_HIGH");
  });

  test("the thresholds are the ones in 22 r82", () => {
    const cell = String(
      sheetRows("22_리포트요소").find((row) => row.r === 82)?.c[3],
    );
    expect(cell).toContain("계획 수립 70 기준");
    expect(cell).toContain("불안\u00b7회복 60 기준");
    expect(cell).toContain("패턴 분석 70 기준");
  });
});
