import { describe, expect, test } from "vitest";
import { scoreAreas } from "./scoring.js";
import { CALC_EXAMPLE } from "./testFixtures.js";

describe("area scores (계산 예시)", () => {
  test("목표 설정 = 75 x 0.7 + q3 100 x 0.3 = 82.5, rounded to 83 (A3)", () => {
    expect(scoreAreas(CALC_EXAMPLE).page1.areas.P1_GOAL.score).toBe(83);
  });
});
