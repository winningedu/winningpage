import { describe, expect, test } from "vitest";
import type { Likert } from "./likert.js";
import { sheetRows } from "./sheet.js";
import {
  representativeTemperament,
  type TempDimScore,
  temperamentCrossChecks,
  temperamentDims,
  temperamentFactors,
  temperamentRules,
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

const factorsFor = (scores: readonly number[]) =>
  temperamentFactors(dimsOf(scores));

describe("four diagnosis factors (18 r21-r25, judge-report R12)", () => {
  test("계산 예시 A31: 35 균형형, 58 보통, 43 보통, 44 중기형", () => {
    const f = factorsFor([70, 65, 60, 45, 55, 70, 55]);
    expect(f.scores).toEqual({
      F_STAB: 35,
      F_SWAY: 58,
      F_PRESS: 43,
      F_SUST: 44,
    });
    expect(f.labels).toEqual({
      F_STAB: "균형형",
      F_SWAY: "보통",
      F_PRESS: "보통",
      F_SUST: "중기형",
    });
  });

  test("PDF p9: 50 균형형, 42 보통, 63 보통, 69 중기형, cause NS", () => {
    const f = factorsFor([50, 50, 50, 75, 75, 75, 50]);
    expect(f.scores).toEqual({
      F_STAB: 50,
      F_SWAY: 42,
      F_PRESS: 63,
      F_SUST: 69,
    });
    expect(f.labels.F_SWAY).toBe("보통");
    expect(f.swayCause).toBe("NS");
  });

  test("factor names come from 18 B22-B25", () => {
    expect(factorsFor([0, 0, 0, 0, 0, 0, 0]).names).toEqual({
      F_STAB: "기질 안정도",
      F_SWAY: "선택 흔들림",
      F_PRESS: "압박 대응력",
      F_SUST: "학습 지속력",
    });
  });

  test("label bands change at 61/31, 40/70, 70/40, 70/40", () => {
    const stab = (ha: number) =>
      factorsFor([0, ha, 0, 0, 0, 0, 0]).labels.F_STAB;
    expect([stab(39), stab(40), stab(69), stab(70)]).toEqual([
      "안정형",
      "균형형",
      "균형형",
      "긴장 민감형",
    ]);
    const sway = (ns: number, sd: number, rd: number) =>
      factorsFor([ns, 0, rd, 0, sd, 0, 0]).labels.F_SWAY;
    expect([sway(60, 100, 57), sway(60, 100, 60), sway(100, 0, 7)]).toEqual([
      "뚝심형",
      "보통",
      "보통",
    ]);
    expect(sway(100, 0, 10)).toBe("흔들림 높음");
    const press = (ha: number, sd: number, ps: number) =>
      factorsFor([0, ha, 0, ps, sd, 0, 0]).labels.F_PRESS;
    expect([press(60, 40, 40), press(60, 36, 40), press(30, 70, 70)]).toEqual([
      "보통",
      "약함",
      "강함",
    ]);
    const sust = (ps: number, sd: number, ns: number) =>
      factorsFor([ns, 0, 0, ps, sd, 0, 0]).labels.F_SUST;
    expect([
      sust(100, 80, 100),
      sust(100, 76, 100),
      sust(40, 40, 60),
      sust(40, 36, 60),
    ]).toEqual(["장기형", "중기형", "중기형", "단기 집중형"]);
  });

  test("sway cause is the largest of NS, 100-SD, RD, ties NS then SD then RD", () => {
    expect(factorsFor([40, 0, 40, 0, 60, 0, 0]).swayCause).toBe("NS");
    expect(factorsFor([10, 0, 50, 0, 60, 0, 0]).swayCause).toBe("RD");
    expect(factorsFor([40, 0, 10, 0, 40, 0, 0]).swayCause).toBe("SD");
    expect(factorsFor([40, 0, 40, 0, 60, 0, 0]).swayCause).toBe("NS");
    expect(factorsFor([50, 0, 90, 0, 50, 0, 0]).swayCause).toBe("RD");
    expect(factorsFor([50, 0, 50, 0, 0, 0, 0]).swayCause).toBe("SD");
  });

  test("formulas in the code match the sheet cells", () => {
    const cell = (r: number) =>
      String(sheetRows("18_기질설정").find((row) => row.r === r)?.c[2]);
    expect(cell(22)).toBe("100 - [HA]");
    expect(cell(23)).toBe("([NS] + (100 - [SD]) + [RD]) / 3");
    expect(cell(24)).toBe("(2 * (100 - [HA]) + [SD] + [PS]) / 4");
    expect(cell(25)).toBe("(2 * [PS] + [SD] + (100 - [NS])) / 4");
  });
});

describe("cross checks with the learning diagnosis (18 r29-r30)", () => {
  const ha = (score: number, raw: Likert) =>
    temperamentCrossChecks({ ha: score, q20Item5: raw, sust: 50, exec: 50 })
      .xchkHa;

  test("HA 70 or more with 별로 or 전혀 differs", () => {
    expect([ha(70, 1), ha(70, 0), ha(100, 1)]).toEqual([true, true, true]);
    expect([ha(70, 2), ha(69, 1), ha(70, 3)]).toEqual([false, false, false]);
  });

  test("HA under 40 with 매우 or 대체로 differs", () => {
    expect([ha(39, 4), ha(39, 3), ha(0, 3)]).toEqual([true, true, true]);
    expect([ha(40, 4), ha(39, 2), ha(39, 1)]).toEqual([false, false, false]);
  });

  const sust = (f: number, exec: number) =>
    temperamentCrossChecks({ ha: 50, q20Item5: 2, sust: f, exec }).xchkSust;

  test("F_SUST under 40 with 학습 수행 70 or more differs", () => {
    expect([sust(39, 70), sust(0, 100)]).toEqual([true, true]);
    expect([sust(40, 70), sust(39, 69)]).toEqual([false, false]);
  });

  test("F_SUST 70 or more with 학습 수행 under 45 differs", () => {
    expect([sust(70, 44), sust(100, 0)]).toEqual([true, true]);
    expect([sust(70, 45), sust(69, 44)]).toEqual([false, false]);
  });

  test("the thresholds are the ones written in the sheet cells", () => {
    const cell = (r: number) =>
      String(sheetRows("18_기질설정").find((row) => row.r === r)?.c[2]);
    expect(cell(29)).toContain("HA 70 이상인데");
    expect(cell(29)).toContain("HA 40 미만인데");
    expect(cell(30)).toContain("F_SUST 40 미만인데 [학습 수행] 70 이상");
    expect(cell(30)).toContain("F_SUST 70 이상인데 [학습 수행] 45 미만");
  });
});

const rulesFor = (track: "M3" | "H12" | "H3", scores: readonly number[]) => {
  const dims = dimsOf(scores);
  return temperamentRules(track, {
    ...Object.fromEntries(Object.entries(dims).map(([d, v]) => [d, v.score])),
    ...temperamentFactors(dims).scores,
  });
};

describe("temperament admission rules (18 r32-r48)", () => {
  test("계산 예시 A32 for H12: rules per area, max 2, in sheet order", () => {
    expect(rulesFor("H12", [70, 65, 60, 45, 55, 70, 55])).toEqual({
      AD_RATIO: ["T_AD_2"],
      AD_HOLISTIC: ["T_AD_5", "T_AD_6"],
      PACE: ["T_PACE_2", "T_PACE_3"],
      SUBJ: ["T_SUBJ_0", "T_SUBJ_1"],
    });
  });

  test("M3 only checks 고교 유형 and 선행 속도 rules", () => {
    // NS 70, RD 70: F_PRESS 100, F_SUST 83 => T_HS_1; T_HS_3 and T_HS_4 also hold, max 2
    const rules = rulesFor("M3", [70, 0, 70, 100, 100, 0, 0]);
    expect(Object.keys(rules)).toEqual(["HS", "PACE"]);
    expect(rules.HS).toEqual(["T_HS_1", "T_HS_3"]);
    expect(rules.PACE).toEqual(["T_PACE_1", "T_PACE_3"]);
  });

  test("H3 only checks 수시/정시 비중 and 학종 rules, empty areas stay listed", () => {
    const rules = rulesFor("H3", [0, 50, 0, 0, 0, 0, 0]);
    expect(Object.keys(rules)).toEqual(["AD_RATIO", "AD_HOLISTIC"]);
    expect(rules.AD_RATIO).toEqual(["T_AD_2"]);
    expect(rules.AD_HOLISTIC).toEqual([]);
  });

  test("OR and AND conditions: T_AD_6 on CO alone, T_AD_3 needs low sway and NS", () => {
    expect(rulesFor("H3", [0, 0, 0, 0, 0, 70, 0]).AD_HOLISTIC).toContain(
      "T_AD_6",
    );
    // NS 70 SD 100 RD 40: F_SWAY 37 => T_AD_3 (sway < 40, NS >= 70)
    expect(rulesFor("H3", [70, 0, 40, 0, 100, 0, 0]).AD_HOLISTIC).toEqual([
      "T_AD_3",
    ]);
  });
});
