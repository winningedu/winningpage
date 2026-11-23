import { describe, expect, test } from "vitest";
import { P1_CODES } from "./codes.js";
import { scoreAreas } from "./scoring.js";
import { CALC_EXAMPLE } from "./testFixtures.js";
import { orderLowToHigh } from "./tie.js";

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
});
