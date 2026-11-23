import { describe, expect, test } from "vitest";
import { P1_CODES } from "./codes.js";
import { scoreAreas } from "./scoring.js";
import { CALC_EXAMPLE } from "./testFixtures.js";
import { orderLowToHigh } from "./tie.js";
import type { AreaScore } from "./types.js";

const area = (score: number, checks = 0, minItem = 50): AreaScore => ({
  score,
  state: "MID",
  level: "L3",
  gapToTarget: 0,
  checks,
  minItem,
});

describe("area order low to high (23_동점규칙 r6-r10)", () => {
  test("계산 예시 A13: 목표 설정 and 우선순위 tie at 83, weight 15 > 10", () => {
    const { page1 } = scoreAreas(CALC_EXAMPLE);
    expect(orderLowToHigh(page1.areas, P1_CODES)).toEqual([
      "P1_LOG",
      "P1_PLAN",
      "P1_ADJ",
      "P1_PATT",
      "P1_EXEC",
      "P1_GOAL",
      "P1_PRIO",
    ]);
  });

  test("step 2: more q10 / q12 checks first", () => {
    // 목표 설정 is earlier in display order and heavier, 활동 기록 has a check
    const areas = { P1_GOAL: area(60, 0), P1_LOG: area(60, 1) };
    expect(orderLowToHigh(areas, ["P1_GOAL", "P1_LOG"])).toEqual([
      "P1_LOG",
      "P1_GOAL",
    ]);
  });

  test("step 3: lower single item after reversal first", () => {
    const areas = { P1_GOAL: area(60, 1, 50), P1_LOG: area(60, 1, 25) };
    expect(orderLowToHigh(areas, ["P1_GOAL", "P1_LOG"])).toEqual([
      "P1_LOG",
      "P1_GOAL",
    ]);
  });

  test("step 4: larger 05 weight first (계획 수립 15 before 우선순위 10)", () => {
    const areas = { P1_PRIO: area(60), P1_PLAN: area(60) };
    expect(orderLowToHigh(areas, ["P1_PRIO", "P1_PLAN"])).toEqual([
      "P1_PLAN",
      "P1_PRIO",
    ]);
  });

  test("step 5: 05 display order when all else ties", () => {
    const areas = { P1_GOAL: area(60), P1_PLAN: area(60) };
    expect(orderLowToHigh(areas, ["P1_GOAL", "P1_PLAN"])).toEqual([
      "P1_GOAL",
      "P1_PLAN",
    ]);
  });
});
