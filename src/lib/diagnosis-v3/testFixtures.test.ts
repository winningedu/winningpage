import { describe, expect, test } from "vitest";
import { TEMP_DIMS } from "./codes.js";
import { SCALE_ITEMS, type ScaleItem, scaleValue } from "./likert.js";
import { CALC_EXAMPLE } from "./testFixtures.js";

const means = <A extends string>(
  items: readonly ScaleItem<A>[],
  answers: readonly (0 | 1 | 2 | 3 | 4)[],
) => {
  const sums = new Map<A, number[]>();
  items.forEach((item, index) => {
    const answer = answers[index];
    if (answer === undefined) throw new Error(`no answer ${item.no}`);
    sums.set(item.area, [
      ...(sums.get(item.area) ?? []),
      scaleValue(items, item.no, answer),
    ]);
  });
  return Object.fromEntries(
    [...sums].map(([area, values]) => [
      area,
      Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) /
        100,
    ]),
  );
};

describe("CALC_EXAMPLE reproduces the 계산 예시 sheet inputs", () => {
  test("q9 scale means (A3-A9)", () => {
    expect(means(SCALE_ITEMS.q9, CALC_EXAMPLE.q9.items)).toEqual({
      P1_GOAL: 75,
      P1_PRIO: 75,
      P1_PLAN: 50,
      P1_EXEC: 66.67,
      P1_LOG: 37.5,
      P1_PATT: 62.5,
      P1_ADJ: 50,
    });
  });

  test("q20 scale means (A15-A17)", () => {
    expect(means(SCALE_ITEMS.q20, CALC_EXAMPLE.q20.items)).toEqual({
      MIND_EFF: 75,
      MIND_GROW: 62.5,
      MIND_RECV: 37.5,
    });
  });

  test("q11 scale means (A18-A23)", () => {
    expect(means(SCALE_ITEMS.q11.H12, CALC_EXAMPLE.q11.items)).toEqual({
      H12_SUBJ: 62.5,
      H12_PERF: 50,
      H12_DEEP: 37.5,
      H12_LINK: 50,
      H12_REC: 62.5,
      H12_STRA: 50,
    });
  });

  test("q23 dimension means (A30)", () => {
    const dims = means(SCALE_ITEMS.q23, CALC_EXAMPLE.q23.items);
    expect(TEMP_DIMS.map((dim) => dims[dim])).toEqual([
      70, 65, 60, 45, 55, 70, 55,
    ]);
  });
});
