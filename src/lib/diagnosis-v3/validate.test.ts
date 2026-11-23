import { describe, expect, test } from "vitest";
import { CALC_EXAMPLE, validAnswers } from "./testFixtures.js";
import { validateAnswers } from "./validate.js";

const DAY1 = "2026-11-09";

describe("validateAnswers", () => {
  test.each(["H12", "H3", "M3"] as const)("accepts the %s fixture", (track) => {
    const answers = validAnswers(track);
    expect(validateAnswers(answers, DAY1)).toEqual({ ok: true, answers });
  });

  test("accepts the 계산 예시 student", () => {
    expect(validateAnswers(CALC_EXAMPLE, DAY1).ok).toBe(true);
  });
});
