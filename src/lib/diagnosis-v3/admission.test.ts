import { describe, expect, test } from "vitest";
import { computeAdmission } from "./admission.js";
import { CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT } from "./testFixtures.js";
import type { DiagnosisV3Context } from "./types.js";

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

  test("PDF p7: 1.99 vs 50% cut 1.7 and 70% cut 1.85 is 소신 in precise mode", () => {
    const answers = {
      ...CALC_EXAMPLE,
      q4: 1,
      q6: 1.99,
      q16: 2,
      q17: 3,
      q18: 2,
    };
    const context = {
      ...CALC_EXAMPLE_CONTEXT,
      admission: {
        ...(CALC_EXAMPLE_CONTEXT.admission as object),
        cut50: 1.7,
        cut70: 1.85,
      },
    } as DiagnosisV3Context;
    expect(computeAdmission(answers, context)).toMatchObject({
      status: "COMPUTED",
      mode: "PRECISE",
      grade9: 1.99,
      baseBand: 3,
      probability: 30, // 40 - 5 (경계) - 5 (탐구 부족) + 0
      band: 3,
      comparison: {
        cut50: 1.7,
        cut70: 1.85,
        mine: 1.99,
        diff50: 0.29,
        diff70: 0.14,
      },
    });
  });
});
