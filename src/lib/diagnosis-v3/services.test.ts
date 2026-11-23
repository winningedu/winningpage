import { describe, expect, test } from "vitest";
import {
  type AreaCode,
  MIND_CODES,
  P1_CODES,
  P2_CODES,
  type TrackCode,
} from "./codes.js";
import { recommendServices, type ServiceInput } from "./services.js";

/** Every area of the track at one score, with overrides. */
const scoresOf = (
  track: TrackCode,
  base: number,
  overrides: Partial<Record<AreaCode, number>> = {},
): Partial<Record<AreaCode, number>> => {
  const scores: Partial<Record<AreaCode, number>> = {};
  for (const code of [...P1_CODES, ...P2_CODES[track], ...MIND_CODES]) {
    scores[code] = base;
  }
  return { ...scores, ...overrides };
};

const GRADE_H1 = 3; // q1 ordinal 3 = high school year 1, track H12

const input = (patch: Partial<ServiceInput> = {}): ServiceInput => ({
  grade: GRADE_H1,
  diagnosedAt: "2026-11-09",
  joinedAt: null,
  areaScores: scoresOf("H12", 90),
  q10: [],
  q12: [],
  q14: [],
  counsel: false,
  reliability: { diagnosis: "GOOD", temperament: "NORMAL" },
  ...patch,
});

const codes = (result: ReturnType<typeof recommendServices>) =>
  result.ranked.map((fit) => fit.code);

describe("service fit (07_서비스)", () => {
  test("계산 예시 A27: 심화탐구 77.2 rank 1, 목표관리 71.4 rank 2", () => {
    // A27: 탐구 심화 26 and one P1_LOG area at 41 give the 9 / 50 term
    const result = recommendServices(
      input({
        areaScores: scoresOf("H12", 90, { H12_DEEP: 26, P1_LOG: 41 }),
        q10: [3, 7, 13],
        q12: [5, 6, 11],
        q14: [2, 6],
      }),
    );
    expect(codes(result)).toEqual(["DEEP", "GOAL"]);
    expect(result.ranked[0]).toMatchObject({
      fit: 77.2,
      difficulty: 50,
      hope: 20,
      deficit: 7.2,
    });
    expect(result.ranked[1]).toMatchObject({
      fit: 71.4,
      difficulty: 50,
      hope: 20,
      deficit: 1.4,
    });
  });

  test("PDF p16: 목표관리 45 and 성장설계 20, both 필요성 있음 (S3)", () => {
    // PDF p2 and p7 scores, p6 q10 picks (2, 15), 15번 option 1 (GOAL and GROW)
    const result = recommendServices(
      input({
        areaScores: {
          P1_GOAL: 74,
          P1_PRIO: 41,
          P1_PLAN: 65,
          P1_EXEC: 56,
          P1_LOG: 56,
          P1_PATT: 74,
          P1_ADJ: 83,
          H12_SUBJ: 91,
          H12_PERF: 65,
          H12_DEEP: 56,
          H12_LINK: 65,
          H12_REC: 65,
          H12_STRA: 65,
          MIND_EFF: 75,
          MIND_GROW: 75,
          MIND_RECV: 65,
        },
        q10: [2, 15],
        q14: [1],
      }),
    );
    expect(codes(result)).toEqual(["GOAL", "GROW"]);
    expect(result.ranked.map((fit) => fit.fit)).toEqual([45, 20]);
    expect(result.ranked.map((fit) => fit.band)).toEqual(["S3", "S3"]);
  });

  test("tiers: 80 and above S1, 65 and above S2, below S3 (07 B31)", () => {
    // GOAL difficulty 50 (items 3 and 7), no hope, related areas at 25 give
    // a deficit of 15 each: 65 exactly. Areas at 0 give 30: 80 exactly.
    const tier = (areaScore: number) =>
      recommendServices(
        input({
          areaScores: scoresOf("H12", 90, {
            P1_PLAN: areaScore,
            P1_EXEC: areaScore,
            P1_LOG: areaScore,
            P1_ADJ: areaScore,
          }),
          q10: [3, 7],
        }),
      ).ranked[0];
    expect(tier(0)).toMatchObject({ code: "GOAL", fit: 80, band: "S1" });
    expect(tier(25)).toMatchObject({ code: "GOAL", fit: 65, band: "S2" });
    expect(tier(26)).toMatchObject({ code: "GOAL", fit: 64.4, band: "S3" });
  });
});
