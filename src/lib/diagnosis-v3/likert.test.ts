import { describe, expect, test } from "vitest";
import { LIKERT_LEVELS, SCALE_ITEMS, scaleValue } from "./likert.js";

describe("likert levels (01_척도문항 A2)", () => {
  test("answer index 0..4 maps to the sheet scores, low to high", () => {
    expect(LIKERT_LEVELS.map((level) => level.score)).toEqual([
      0, 25, 50, 75, 100,
    ]);
    expect(LIKERT_LEVELS[4]?.label).toBe("매우 그렇다");
    expect(LIKERT_LEVELS[0]?.label).toBe("전혀 그렇지 않다");
  });
});

describe("scale items (01_척도문항)", () => {
  test("q9 has 15 items mapped to PAGE1 stages, item 15 is 학습 수행", () => {
    expect(SCALE_ITEMS.q9).toHaveLength(15);
    expect(SCALE_ITEMS.q9[0]).toMatchObject({ no: 1, area: "P1_GOAL" });
    expect(SCALE_ITEMS.q9[14]).toMatchObject({ no: 15, area: "P1_EXEC" });
  });

  test("q11 has 12 items per track", () => {
    expect(SCALE_ITEMS.q11.H12.map((item) => item.area)[4]).toBe("H12_DEEP");
    expect(SCALE_ITEMS.q11.H3).toHaveLength(12);
    expect(SCALE_ITEMS.q11.M3[11]?.area).toBe("M3_PREP");
  });

  test("reverse items are the 역문항 column", () => {
    const reversed = (items: readonly { no: number; reverse: boolean }[]) =>
      items.filter((item) => item.reverse).map((item) => item.no);
    expect(reversed(SCALE_ITEMS.q9)).toEqual([]);
    expect(reversed(SCALE_ITEMS.q20)).toEqual([3, 5]);
    expect(reversed(SCALE_ITEMS.q23)).toEqual([5, 10, 15, 20, 25, 30, 35]);
  });

  test("q23 items carry their temperament dimension", () => {
    expect(SCALE_ITEMS.q23.map((item) => item.area).slice(0, 6)).toEqual([
      "NS",
      "NS",
      "NS",
      "NS",
      "NS",
      "HA",
    ]);
  });

  test("scaleValue converts and reverses", () => {
    expect(scaleValue(SCALE_ITEMS.q9, 1, 3)).toBe(75);
    expect(scaleValue(SCALE_ITEMS.q20, 5, 3)).toBe(25);
    expect(scaleValue(SCALE_ITEMS.q20, 3, 1)).toBe(75);
  });
});
