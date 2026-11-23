import { describe, expect, test } from "vitest";
import type { Likert } from "./likert.js";
import { temperamentDims } from "./temperament.js";
import { CALC_EXAMPLE } from "./testFixtures.js";

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
