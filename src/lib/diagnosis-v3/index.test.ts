import { expect, test } from "vitest";
import { scoreDiagnosisV3, validateAnswers } from "./index.js";
import { CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT } from "./testFixtures.js";

test("the engine entry is declared but not implemented yet", () => {
  expect(() => scoreDiagnosisV3(CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT)).toThrow(
    "not implemented",
  );
});

test("validation is exported from the entry", () => {
  expect(validateAnswers(CALC_EXAMPLE, "2026-11-09").ok).toBe(true);
});
