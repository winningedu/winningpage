import { describe, expect, test } from "vitest";
import { scoreAreas } from "./scoring.js";
import { CALC_EXAMPLE } from "./testFixtures.js";

describe("area scores (계산 예시)", () => {
  test("목표 설정 = 75 x 0.7 + q3 100 x 0.3 = 82.5, rounded to 83 (A3)", () => {
    expect(scoreAreas(CALC_EXAMPLE).page1.areas.P1_GOAL.score).toBe(83);
  });

  test("PAGE1 seven areas use q10 checks: 0 = 100, 1 = 50 (A4-A9)", () => {
    const scores = Object.fromEntries(
      Object.entries(scoreAreas(CALC_EXAMPLE).page1.areas).map(([k, v]) => [
        k,
        v.score,
      ]),
    );
    expect(scores).toEqual({
      P1_GOAL: 83,
      P1_PRIO: 83,
      P1_PLAN: 50,
      P1_EXEC: 77,
      P1_LOG: 41,
      P1_PATT: 74,
      P1_ADJ: 65,
    });
  });

  test("PAGE2 고1\u00b72 areas use q12 checks, 2 checks = 0 (A18-A23)", () => {
    const scores = Object.fromEntries(
      Object.entries(scoreAreas(CALC_EXAMPLE).page2.areas).map(([k, v]) => [
        k,
        v?.score,
      ]),
    );
    expect(scores).toEqual({
      H12_SUBJ: 74,
      H12_PERF: 65,
      H12_DEEP: 26,
      H12_LINK: 65,
      H12_REC: 74,
      H12_STRA: 50,
    });
  });

  test("MIND: no aux for 자기효능감 and 성장 마인드셋, q10 for 불안\u00b7회복 (A15-A17)", () => {
    const { mind } = scoreAreas(CALC_EXAMPLE);
    expect(mind.areas.MIND_EFF.score).toBe(75);
    expect(mind.areas.MIND_GROW.score).toBe(63);
    expect(mind.areas.MIND_RECV.score).toBe(41);
  });
});
