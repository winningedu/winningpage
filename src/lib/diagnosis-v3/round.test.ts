import { describe, expect, test } from "vitest";
import { roundHalfUp1, roundHalfUpInt } from "./round.js";

describe("roundHalfUpInt", () => {
  test("rounds .5 up on exact fractions", () => {
    expect(roundHalfUpInt(165, 2)).toBe(83); // 82.5
    expect(roundHalfUpInt(165, 4)).toBe(41); // 41.25
  });

  test("area score 37.5 x 0.7 + 50 x 0.3 from integer numerators", () => {
    // scale sum 25 + 50 over 2 items, aux 50: (75 x 7 + 50 x 3 x 2) / (10 x 2)
    expect(roundHalfUpInt(75 * 7 + 50 * 3 * 2, 10 * 2)).toBe(41);
  });

  test("rejects float inputs", () => {
    expect(() => roundHalfUpInt(66.35, 1)).toThrow();
  });
});

describe("roundHalfUp1", () => {
  test("keeps one decimal, .05 up, where floats would round down", () => {
    expect((66.35).toFixed(1)).toBe("66.3");
    expect(roundHalfUp1(6635, 100)).toBe(66.4);
  });

  test("calc example PAGE1 total 6695 / 100 is 67.0", () => {
    expect(roundHalfUp1(6695, 100)).toBe(67);
  });
});
