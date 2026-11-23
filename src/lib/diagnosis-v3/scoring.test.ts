import { describe, expect, test } from "vitest";
import { P1_CODES } from "./codes.js";
import {
  AREA_STATE_LABELS,
  areaState,
  compositeOf,
  gradeLevel,
  scoreAreas,
} from "./scoring.js";
import { CALC_EXAMPLE } from "./testFixtures.js";
import type { DiagnosisV3Answers } from "./types.js";

const withAnswers = (
  patch: Partial<DiagnosisV3Answers>,
): DiagnosisV3Answers => ({
  ...CALC_EXAMPLE,
  ...patch,
});
const p1 = (answers: DiagnosisV3Answers) => scoreAreas(answers).page1.areas;

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

describe("spec worked examples (기능요구명세서 No 34-36)", () => {
  test("No 35: 활동 기록 25 and 50 with one q10 check = 41", () => {
    expect(p1(withAnswers({ q10: [8] })).P1_LOG.score).toBe(41);
  });

  test("No 36: 불안\u00b7회복 reverse 75 = 25, 50, one check (q10 13) = 41", () => {
    const { mind } = scoreAreas(withAnswers({ q10: [13] }));
    expect(mind.areas.MIND_RECV.score).toBe(41);
  });

  test("No 36 without the check: 37.5 x 0.7 + 100 x 0.3 = 56.25 = 56", () => {
    const { mind } = scoreAreas(withAnswers({ q10: [] }));
    expect(mind.areas.MIND_RECV.score).toBe(56);
  });
});

describe("exclusive and empty picks (No 37, No 127-129; 16 r22-r26)", () => {
  test("No 127: q10 and q12 skipped count as 0 checks, aux 100", () => {
    const { q10: _q10, q12: _q12, ...skipped } = CALC_EXAMPLE;
    const { page1, page2 } = scoreAreas(skipped);
    expect(page1.areas.P1_PLAN.score).toBe(65);
    expect(page2.areas.H12_DEEP?.score).toBe(56);
  });

  test("No 128: an exclusive pick next to normal ones is ignored", () => {
    expect(p1(withAnswers({ q10: [16, 8] })).P1_LOG.score).toBe(41);
    const { page2 } = scoreAreas(withAnswers({ q12: [13, 5] }));
    expect(page2.areas.H12_DEEP?.score).toBe(41);
  });

  test("No 37: only the exclusive pick leaves every area at 0 checks", () => {
    const areas = p1(withAnswers({ q10: [16] }));
    expect(areas.P1_PLAN.score).toBe(65);
    expect(areas.P1_LOG.score).toBe(56);
  });

  test("three checks on 학습 수행 (00 B7) score the 2개 value 0", () => {
    // q9 7, 8, 15 = 75, 50, 75: 200 / 3 x 0.7 = 46.67
    expect(p1(withAnswers({ q10: [5, 6, 15] })).P1_EXEC.score).toBe(47);
  });
});

describe("area state and grade level (06 r14-r23, spec No 40-41)", () => {
  test("states follow 70 / 60 / 45 (계산 예시 D3-D9)", () => {
    const areas = p1(CALC_EXAMPLE);
    expect(areas.P1_GOAL.state).toBe("TOP");
    expect(areas.P1_EXEC.state).toBe("TOP");
    expect(areas.P1_ADJ.state).toBe("MID");
    expect(areas.P1_PLAN.state).toBe("LOW");
    expect(areas.P1_LOG.state).toBe("WEAK");
  });

  test("levels follow 80 / 70 / 60 / 45 (spec No 41)", () => {
    const areas = p1(CALC_EXAMPLE);
    expect(areas.P1_GOAL.level).toBe("L1");
    expect(areas.P1_EXEC.level).toBe("L2");
    expect(areas.P1_ADJ.level).toBe("L3");
    expect(areas.P1_PLAN.level).toBe("L4");
    expect(areas.P1_LOG.level).toBe("L5");
  });

  test.each([
    [80, "TOP", "L1"],
    [79, "TOP", "L2"],
    [70, "TOP", "L2"],
    [69, "MID", "L3"],
    [60, "MID", "L3"],
    [59, "LOW", "L4"],
    [45, "LOW", "L4"],
    [44, "WEAK", "L5"],
    [0, "WEAK", "L5"],
  ] as const)("%d is %s and %s (이 점수 이상)", (score, state, level) => {
    expect(areaState(score)).toBe(state);
    expect(gradeLevel(score)).toBe(level);
  });

  test("PAGE1 and PAGE2 state labels come from 06 B20-B23", () => {
    expect(AREA_STATE_LABELS.page1).toEqual({
      TOP: "상위",
      MID: "보통",
      LOW: "보완 필요",
      WEAK: "취약",
    });
    expect(AREA_STATE_LABELS.page2).toEqual({
      TOP: "양호",
      MID: "점검 필요",
      LOW: "보완 필요",
      WEAK: "우선 보완",
    });
  });
});

describe("tie inputs and gap (23 r7-r8, 06 C8)", () => {
  test("checks count the q10 / q12 picks mapped to the area", () => {
    const { page1, page2, mind } = scoreAreas(CALC_EXAMPLE);
    expect(page1.areas.P1_LOG.checks).toBe(1);
    expect(page1.areas.P1_GOAL.checks).toBe(0);
    expect(page2.areas.H12_DEEP?.checks).toBe(2);
    expect(mind.areas.MIND_RECV.checks).toBe(1);
    expect(mind.areas.MIND_EFF.checks).toBe(0);
  });

  test("minItem is the lowest scale value after reversal", () => {
    const { page1, mind } = scoreAreas(CALC_EXAMPLE);
    expect(page1.areas.P1_LOG.minItem).toBe(25);
    expect(page1.areas.P1_EXEC.minItem).toBe(50);
    // 9-3 별로 reversed to 75, 9-4 보통 50
    expect(mind.areas.MIND_GROW.minItem).toBe(50);
    // 9-5 대체로 reversed to 25
    expect(mind.areas.MIND_RECV.minItem).toBe(25);
  });

  test("gapToTarget = max(0, 75 - score)", () => {
    const areas = p1(CALC_EXAMPLE);
    expect(areas.P1_LOG.gapToTarget).toBe(34);
    expect(areas.P1_PATT.gapToTarget).toBe(1);
    expect(areas.P1_GOAL.gapToTarget).toBe(0);
  });
});

describe("composites (05 E weights, spec No 38-39)", () => {
  test("계산 예시 A10: PAGE1 6695 / 100 = 66.95 = 67.0, L3", () => {
    const { page1 } = scoreAreas(CALC_EXAMPLE);
    expect(page1.total).toBe(67);
    expect(page1.level).toBe("L3");
  });

  test("계산 예시 A24: PAGE2 5690 / 100 = 56.9, L4", () => {
    const { page2 } = scoreAreas(CALC_EXAMPLE);
    expect(page2.total).toBe(56.9);
    expect(page2.level).toBe("L4");
  });

  test("spec No 38 F: 83, 83, 50, 74, 41, 74, 65 = 66.35 = 66.4, not float 66.3", () => {
    const scores = [83, 83, 50, 74, 41, 74, 65];
    const areas = Object.fromEntries(
      P1_CODES.map((code, i) => [code, { score: scores[i] as number }]),
    );
    expect(compositeOf(areas, P1_CODES)).toBe(66.4);
  });
});

describe("area order and MIND extremes (23_동점규칙)", () => {
  test("PAGE1 order low to high matches 계산 예시 A13", () => {
    expect(scoreAreas(CALC_EXAMPLE).page1.order).toEqual([
      "P1_LOG",
      "P1_PLAN",
      "P1_ADJ",
      "P1_PATT",
      "P1_EXEC",
      "P1_GOAL",
      "P1_PRIO",
    ]);
  });

  test("PAGE2 order low to high: 65 and 74 ties fall to weight, then display order", () => {
    expect(scoreAreas(CALC_EXAMPLE).page2.order).toEqual([
      "H12_DEEP",
      "H12_STRA",
      "H12_PERF",
      "H12_LINK",
      "H12_SUBJ",
      "H12_REC",
    ]);
  });

  test("MIND lowest and highest", () => {
    const { mind } = scoreAreas(CALC_EXAMPLE);
    expect(mind.lowest).toBe("MIND_RECV");
    expect(mind.highest).toBe("MIND_EFF");
  });

  test("MIND highest tie keeps display order (R2 (a), weights all 0)", () => {
    // 9-1, 9-2 = 75, 75 and 9-3 reversed 75, 9-4 = 75: both 75, minItem 75
    const { mind } = scoreAreas(
      withAnswers({ q20: { ...CALC_EXAMPLE.q20, items: [3, 3, 1, 3, 3, 2] } }),
    );
    expect(mind.areas.MIND_GROW.score).toBe(75);
    expect(mind.highest).toBe("MIND_EFF");
  });
});
