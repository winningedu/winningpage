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
});
