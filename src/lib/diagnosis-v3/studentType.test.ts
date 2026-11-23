import { describe, expect, test } from "vitest";
import { scoreReliability } from "./reliability.js";
import { scoreAreas } from "./scoring.js";
import { studentType } from "./studentType.js";
import { CALC_EXAMPLE } from "./testFixtures.js";

describe("student type (06 r25-r33, spec No 48-57)", () => {
  test("계산 예시 A12: 7순위 기록 단절형 = TYPE_9", () => {
    expect(
      studentType(scoreAreas(CALC_EXAMPLE), scoreReliability(CALC_EXAMPLE)),
    ).toBe(9);
  });
});
