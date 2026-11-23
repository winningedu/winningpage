import { describe, expect, test } from "vitest";
import { roundHalfUpInt } from "./round.js";

describe("roundHalfUpInt", () => {
  test("rounds .5 up on exact fractions", () => {
    expect(roundHalfUpInt(165, 2)).toBe(83); // 82.5
    expect(roundHalfUpInt(165, 4)).toBe(41); // 41.25
  });
});
