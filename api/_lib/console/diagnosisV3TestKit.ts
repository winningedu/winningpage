// v3 payload fixture for the console tests. Only the machine layer the console reads (payload.scores)
// is typed out; the rest of DiagnosisV3Scores is not read by the console, so the fixture casts it once here.

import {
  MIND_CODES,
  type MindCode,
  P1_CODES,
  type P1Code,
  P2_CODES,
  type P2Code,
  type TrackCode,
} from "../../../src/lib/diagnosis-v3/codes.js";
import {
  type AreaScore,
  type AreaState,
  type DiagnosisV3Payload,
  type DiagnosisV3Scores,
  SCHEMA_VERSION,
} from "../../../src/lib/diagnosis-v3/types.js";

// 06_임계값 r20-r23: state thresholds 70, 60, 45 (kept in sync by diagnosisStatus.test.ts).
const stateOf = (score: number): AreaState =>
  score >= 70 ? "TOP" : score >= 60 ? "MID" : score >= 45 ? "LOW" : "WEAK";

const areaScore = (score: number): AreaScore => ({
  score,
  state: stateOf(score),
  level: "L3",
  gapToTarget: Math.max(0, 75 - score),
  checks: 0,
  minItem: 3,
});

const byScoreAsc = <C extends string>(scores: Record<C, number>): C[] =>
  (Object.keys(scores) as C[]).sort((a, b) => scores[a] - scores[b]);

export interface V3Options {
  track?: TrackCode;
  page1?: Partial<Record<P1Code, number>>;
  page2?: Partial<Record<string, number>>;
  level?: "L1" | "L2" | "L3" | "L4";
  total1?: number;
  total2?: number;
}

const P1_BASE: Record<P1Code, number> = {
  P1_GOAL: 64,
  P1_PRIO: 58,
  P1_PLAN: 72,
  P1_EXEC: 40,
  P1_LOG: 66,
  P1_PATT: 61,
  P1_ADJ: 75,
};
const P2_BASE = [74, 55, 62, 68, 49, 71];

export function v3Scores(options: V3Options = {}): DiagnosisV3Scores {
  const track = options.track ?? "H12";
  const p1 = { ...P1_BASE, ...options.page1 } as Record<P1Code, number>;
  const p2Codes = P2_CODES[track] as readonly P2Code[];
  const p2 = Object.fromEntries(
    p2Codes.map((c, i) => [c, options.page2?.[c] ?? (P2_BASE[i] as number)]),
  ) as Record<P2Code, number>;
  const mind: Record<MindCode, number> = {
    MIND_EFF: 60,
    MIND_GROW: 70,
    MIND_RECV: 55,
  };
  const scores = {
    track,
    grade: 3,
    page1: {
      areas: Object.fromEntries(P1_CODES.map((c) => [c, areaScore(p1[c])])),
      total: options.total1 ?? 62.3,
      level: "L3",
      order: byScoreAsc(p1),
    },
    mind: {
      areas: Object.fromEntries(MIND_CODES.map((c) => [c, areaScore(mind[c])])),
      lowest: "MIND_RECV",
      highest: "MIND_GROW",
    },
    page2: {
      areas: Object.fromEntries(p2Codes.map((c) => [c, areaScore(p2[c])])),
      total: options.total2 ?? 63.1,
      level: "L3",
      order: byScoreAsc(p2),
    },
    urgency: {
      base: 20,
      lowAreas: 2,
      points: 20,
      level: options.level ?? "L3",
    },
  };
  return scores as unknown as DiagnosisV3Scores;
}

/** The stored report body: only version and scores, which are all the console reads. */
export const v3Payload = (options: V3Options = {}) =>
  ({ version: SCHEMA_VERSION, scores: v3Scores(options) }) as Pick<
    DiagnosisV3Payload,
    "version" | "scores"
  >;
