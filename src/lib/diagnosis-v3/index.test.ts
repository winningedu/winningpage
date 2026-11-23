import { describe, expect, test } from "vitest";
import { scoreDiagnosisV3, validateAnswers } from "./index.js";
import { CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT } from "./testFixtures.js";
import { SCHEMA_VERSION } from "./types.js";

const calc = () => scoreDiagnosisV3(CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT);

test("validation is exported from the entry", () => {
  expect(validateAnswers(CALC_EXAMPLE, "2026-11-09").ok).toBe(true);
});

describe("계산 예시 scores", () => {
  test("composites, grade level and student type (계산 예시 D10, D12, D24)", () => {
    const { version, scores } = calc();
    expect(version).toBe(SCHEMA_VERSION);
    expect(scores.page1.total).toBe(67);
    expect(scores.page1.level).toBe("L3");
    expect(scores.page2.total).toBe(56.9);
    expect(scores.studentType).toBe(9);
  });
});
