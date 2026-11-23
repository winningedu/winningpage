import { describe, expect, test } from "vitest";
import { computeAdmission } from "./admission.js";
import { CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT } from "./testFixtures.js";
import type { DiagnosisV3Context } from "./types.js";

const withCuts = (
  cut50: number | null,
  cut70: number | null,
): DiagnosisV3Context => ({
  ...CALC_EXAMPLE_CONTEXT,
  admission: {
    ...(CALC_EXAMPLE_CONTEXT.admission as object),
    cut50,
    cut70,
  } as DiagnosisV3Context["admission"],
});

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

  test("exact cut values stay on the closer band (08 r6-r9)", () => {
    const at = (q6: number, cut50: number | null, cut70: number) =>
      computeAdmission(
        { ...CALC_EXAMPLE, q4: 1, q6, q16: 4, q17: 7, q18: 5 },
        withCuts(cut50, cut70),
      );
    // precise: 50% cut 1.7, 70% cut 1.85, margin 0.30
    expect(at(1.7, 1.7, 1.85)).toMatchObject({ baseBand: 1 });
    expect(at(1.71, 1.7, 1.85)).toMatchObject({ baseBand: 2 });
    expect(at(1.85, 1.7, 1.85)).toMatchObject({ baseBand: 2 });
    expect(at(2.15, 1.7, 1.85)).toMatchObject({ baseBand: 3 });
    expect(at(2.16, 1.7, 1.85)).toMatchObject({ baseBand: 4 });
    // basic: 70% cut 1.85 - 0.30 = 1.55
    expect(at(1.55, null, 1.85)).toMatchObject({ baseBand: 1 });
    expect(at(1.56, null, 1.85)).toMatchObject({ baseBand: 2 });
  });

  test("skipped without q15 or with q4 잘 모르겠어요 (08 r48)", () => {
    const { q15: _q15, ...noTarget } = CALC_EXAMPLE;
    expect(computeAdmission(noTarget, CALC_EXAMPLE_CONTEXT)).toEqual({
      status: "SKIPPED",
    });
    expect(
      computeAdmission({ ...CALC_EXAMPLE, q4: 4 }, CALC_EXAMPLE_CONTEXT),
    ).toEqual({ status: "SKIPPED" });
  });

  test("no data when the 70% cut is missing, even with a 50% cut (08 r49)", () => {
    expect(computeAdmission(CALC_EXAMPLE, withCuts(1.7, null))).toEqual({
      status: "NODATA",
    });
    expect(
      computeAdmission(CALC_EXAMPLE, {
        ...CALC_EXAMPLE_CONTEXT,
        admission: null,
      }),
    ).toEqual({ status: "NODATA" });
  });

  test("basic mode asks for the BAND_PRECISION note, precise does not", () => {
    expect(computeAdmission(CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT)).toMatchObject({
      precisionNote: true,
    });
    expect(computeAdmission(CALC_EXAMPLE, withCuts(1.2, 1.28))).toMatchObject({
      precisionNote: false,
    });
  });

  test("M3 track hides the section (22 r70)", () => {
    expect(
      computeAdmission({ ...CALC_EXAMPLE, q1: 2 }, CALC_EXAMPLE_CONTEXT),
    ).toEqual({ status: "HIDDEN" });
  });
});
