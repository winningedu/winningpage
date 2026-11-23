import { describe, expect, test } from "vitest";
import { scoreReliability } from "./reliability.js";
import { CALC_EXAMPLE } from "./testFixtures.js";

describe("response reliability (17_신뢰도, spec No 42-47)", () => {
  test("계산 예시 A11: no flag, 학습진단 양호, 기질 정상", () => {
    expect(scoreReliability(CALC_EXAMPLE)).toEqual({
      flags: {
        F1: false,
        F2: false,
        F3: false,
        F4: false,
        F5: false,
        F6: false,
      },
      diagnosis: "GOOD",
      temperament: "NORMAL",
    });
  });
});
