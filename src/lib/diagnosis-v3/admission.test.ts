import { describe, expect, test } from "vitest";
import { computeAdmission } from "./admission.js";
import { CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT } from "./testFixtures.js";

describe("computeAdmission", () => {
  test("계산 예시 A29: 1.40 five-grade is 2.25, 70% cut 1.28, band 위험 prob 15", () => {
    const result = computeAdmission(CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT);
    expect(result).toMatchObject({
      status: "COMPUTED",
      mode: "BASIC",
      grade9: 2.25,
      baseBand: 4,
      probability: 15,
      band: 4,
    });
  });
});
