import { describe, expect, test } from "vitest";
import type { Likert } from "./likert.js";
import {
  representativeTemperament,
  type TempDimScore,
  temperamentDims,
} from "./temperament.js";
import { CALC_EXAMPLE } from "./testFixtures.js";

const dimsOf = (
  scores: readonly number[],
  extremes: readonly number[] = [0, 0, 0, 0, 0, 0, 0],
) =>
  Object.fromEntries(
    ["NS", "HA", "RD", "PS", "SD", "CO", "ST"].map((dim, i) => [
      dim,
      { score: scores[i], level: "M", extremes: extremes[i] },
    ]),
  ) as unknown as Record<
    "NS" | "HA" | "RD" | "PS" | "SD" | "CO" | "ST",
    TempDimScore
  >;

const L = (...values: Likert[]) => values;

describe("temperament dimension scores (18_기질설정 r6-r16, 01 Q23)", () => {
  test("CALC_EXAMPLE gives NS 70 HA 65 RD 60 PS 45 SD 55 CO 70 ST 55 (계산 예시 A30)", () => {
    const dims = temperamentDims(CALC_EXAMPLE.q23);
    expect(
      Object.fromEntries(Object.entries(dims).map(([d, v]) => [d, v.score])),
    ).toEqual({ NS: 70, HA: 65, RD: 60, PS: 45, SD: 55, CO: 70, ST: 55 });
    expect(
      Object.fromEntries(Object.entries(dims).map(([d, v]) => [d, v.level])),
    ).toEqual({
      NS: "H",
      HA: "M",
      RD: "M",
      PS: "M",
      SD: "M",
      CO: "H",
      ST: "M",
    });
  });

  test("answers in the PDF p9 example give 50 50 50 75 75 75 50", () => {
    // 3 = middle value 75 needs reverse item 2 (=50 -> 50): build per dimension.
    // 50: 2,2,2,2 and reverse item 2 (reversed 50); 75: 3,3,3,3 and reverse 1
    const mid = L(2, 2, 2, 2, 2);
    const high = L(3, 3, 3, 3, 1);
    const dims = temperamentDims({
      items: [...mid, ...mid, ...mid, ...high, ...high, ...high, ...mid],
      verify: 3,
    });
    expect(Object.values(dims).map((d) => d.score)).toEqual([
      50, 50, 50, 75, 75, 75, 50,
    ]);
  });
});

describe("representative temperament (18 r18-r19, 23 r13-r15)", () => {
  test("a 5 point gap is single: NS 70 over HA 65 (계산 예시 A30)", () => {
    const rep = representativeTemperament(dimsOf([70, 65, 60, 45, 55, 70, 55]));
    expect(rep).toMatchObject({ kind: "single", dim: "NS" });
  });

  test("a gap under 5 is mixed, 1st then 2nd", () => {
    const rep = representativeTemperament(dimsOf([50, 60, 40, 56, 0, 0, 0]));
    expect(rep).toMatchObject({ kind: "mixed", dims: ["HA", "PS"] });
  });

  test("PDF p9: PS 75 over three 50s is single PS, second NS", () => {
    const rep = representativeTemperament(dimsOf([50, 50, 50, 75, 75, 75, 50]));
    expect(rep).toMatchObject({ kind: "single", dim: "PS" });
    expect(rep.ranked).toEqual(["PS", "NS", "HA", "RD"]);
  });

  test("equal scores: more extreme answers first, then NS HA RD PS", () => {
    expect(
      representativeTemperament(
        dimsOf([50, 50, 50, 50, 0, 0, 0], [0, 0, 2, 1, 0, 0, 0]),
      ).ranked,
    ).toEqual(["RD", "PS", "NS", "HA"]);
  });

  test("SD CO ST never become representative", () => {
    expect(
      representativeTemperament(dimsOf([10, 10, 10, 10, 90, 90, 90])).ranked,
    ).toHaveLength(4);
  });
});
