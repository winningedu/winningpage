import { describe, expect, test } from "vitest";
import type { Likert } from "./likert.js";
import { sheetRows } from "./sheet.js";
import {
  representativeTemperament,
  scoreTemperament,
  type TempDimScore,
  temperamentCounsel,
  temperamentCrossChecks,
  temperamentDims,
  temperamentFactors,
  temperamentMethods,
  temperamentPage9,
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

describe("plan methods (18 r50-r52) and counsel flag (18 r27)", () => {
  test("M_NS at NS 70, M_HA at HA 60, M_PS under PS 50, sheet order", () => {
    expect(temperamentMethods({ NS: 70, HA: 60, PS: 49 })).toEqual([
      "M_NS",
      "M_HA",
      "M_PS",
    ]);
    expect(temperamentMethods({ NS: 69, HA: 59, PS: 50 })).toEqual([]);
    expect(temperamentMethods({ NS: 0, HA: 80, PS: 80 })).toEqual(["M_HA"]);
  });

  const reliable = { diagnosis: "GOOD", temperament: "NORMAL" } as const;
  const counsel = (ha: number, sd: number, recv: number) =>
    temperamentCounsel({ HA: ha, SD: sd, recv }, reliable);

  test("HA 70 or more AND SD under 40 AND 불안 회복 under 40", () => {
    expect(counsel(70, 39, 39)).toBe(true);
    expect(counsel(69, 39, 39)).toBe(false);
    expect(counsel(70, 40, 39)).toBe(false);
    expect(counsel(70, 39, 40)).toBe(false);
  });

  test("a SIMPLE diagnosis or a CAUTION temperament never gets counsel", () => {
    const low = { HA: 90, SD: 0, recv: 0 };
    expect(
      temperamentCounsel(low, { diagnosis: "SIMPLE", temperament: "NORMAL" }),
    ).toBe(false);
    expect(
      temperamentCounsel(low, { diagnosis: "MID", temperament: "CAUTION" }),
    ).toBe(false);
    expect(
      temperamentCounsel(low, { diagnosis: "MID", temperament: "NORMAL" }),
    ).toBe(true);
  });
});

describe("scoreTemperament on CALC_EXAMPLE (계산 예시 A30-A32)", () => {
  const result = scoreTemperament({
    q23: CALC_EXAMPLE.q23,
    track: "H12",
    q20Item5: CALC_EXAMPLE.q20.items[4] as Likert,
    exec: 66,
    recv: 50,
    reliability: { diagnosis: "GOOD", temperament: "NORMAL" },
  });

  test("dims, representative, factors, labels", () => {
    expect(result.dims.NS).toEqual({ score: 70, level: "H" });
    expect(result.representative).toEqual({ kind: "single", dim: "NS" });
    expect(result.factors).toEqual({
      F_STAB: 35,
      F_SWAY: 58,
      F_PRESS: 43,
      F_SUST: 44,
    });
    expect(result.factorLabels.F_SUST).toBe("중기형");
    expect(result.swayCause).toBe("NS");
  });

  test("checks, counsel, rules and methods", () => {
    expect(result).toMatchObject({
      xchkHa: false,
      xchkSust: false,
      counsel: false,
      methods: ["M_NS", "M_HA", "M_PS"],
    });
    expect(result.rules).toEqual({
      AD_RATIO: ["T_AD_2"],
      AD_HOLISTIC: ["T_AD_5", "T_AD_6"],
      PACE: ["T_PACE_2", "T_PACE_3"],
      SUBJ: ["T_SUBJ_0", "T_SUBJ_1"],
    });
  });

  test("mixed representative lists the two dims, 1st first", () => {
    const mixed = scoreTemperament({
      q23: {
        // NS 50: 2 x4 + reverse 2; HA 50 ...; all dimensions the same => NS, HA by fixed order
        items: Array(35).fill(2) as Likert[],
        verify: 3,
      },
      track: "H3",
      q20Item5: 2,
      exec: 50,
      recv: 50,
      reliability: { diagnosis: "GOOD", temperament: "NORMAL" },
    });
    expect(mixed.representative).toEqual({ kind: "mixed", dims: ["NS", "HA"] });
  });
});

describe("page 9 text (22 r86-r94, PDF p9)", () => {
  const mid = L(2, 2, 2, 2, 2);
  const high = L(3, 3, 3, 3, 1);
  const q23 = {
    items: [...mid, ...mid, ...mid, ...high, ...high, ...high, ...mid],
    verify: 3 as Likert,
  };
  const pdf = scoreTemperament({
    q23,
    track: "H12",
    q20Item5: 2,
    exec: 50,
    recv: 50,
    reliability: { diagnosis: "GOOD", temperament: "NORMAL" },
  });

  test("single type: title, hero, strengths and cautions of PS", () => {
    const page = temperamentPage9(pdf, "NORMAL");
    expect(page.title).toBe("시작하면 끝까지 해내는 기질입니다.");
    expect(page.hero).toEqual({
      name: "끈기\u00b7성취형",
      sub: "인내력 우세 \u00b7 자극추구 중간",
      body: "당장 결과가 보이지 않아도 꾸준히 이어 가는 힘이 있습니다. 방향이 맞는지 주기적으로 점검하면 끈기가 그대로 성과가 됩니다.",
    });
    expect(page.study).toEqual({
      strengths: [
        "지루한 반복도 끝까지 해냅니다.",
        "장기 계획을 끝까지 가져갈 힘이 있습니다.",
      ],
      cautions: [
        "방법이 맞지 않아도 계속 붙들고 있을 수 있습니다.",
        "스스로를 너무 몰아붙여 지칠 수 있습니다.",
      ],
    });
  });

  test("seven dims with score, level and the level sentence", () => {
    const page = temperamentPage9(pdf, "NORMAL");
    expect(page.dims.map((d) => [d.dim, d.score, d.level])).toEqual([
      ["NS", 50, "M"],
      ["HA", 50, "M"],
      ["RD", 50, "M"],
      ["PS", 75, "H"],
      ["SD", 75, "H"],
      ["CO", 75, "H"],
      ["ST", 50, "M"],
    ]);
    expect(page.dims[0]?.text).toBe(
      "새로운 것도 시도하고 익숙한 방식도 유지하는, 균형 잡힌 편이에요.",
    );
  });

  test("cross check, factor lines and the sway cause", () => {
    const page = temperamentPage9(pdf, "NORMAL");
    expect(page.crossCheck).toEqual(["학습진단 응답과 같은 방향입니다."]);
    expect(page.factors.items.map((i) => i.text)).toEqual([
      "기질 안정도 50 \u00b7 균형형 상황에 따라 긴장도가 달라지는 편입니다.",
      "선택 흔들림 42 \u00b7 보통 목표는 유지하되 상황에 따라 전략을 바꾸는 편입니다.",
      "압박 대응력 63 \u00b7 보통 압박이 커지면 흔들릴 수 있어 실전 리허설이 도움이 됩니다.",
      "학습 지속력 69 \u00b7 중기형 2~4주 단위로 계획을 끊어 점검하면 잘 이어 갑니다.",
    ]);
    expect(page.factors.swayCause).toBe("주된 원인: 새것에 끌림(자극추구)");
    expect(page.protect).toContain("기질에는 좋고 나쁨이 없습니다.");
    expect(page.lowReliability).toBeUndefined();
  });

  test("CAUTION adds TEMP_LOWREL, DIFF cross checks show their sentences", () => {
    const diff = scoreTemperament({
      q23,
      track: "H12",
      q20Item5: 0,
      exec: 50,
      recv: 50,
      reliability: { diagnosis: "GOOD", temperament: "CAUTION" },
    });
    const page = temperamentPage9(
      { ...diff, xchkHa: true, xchkSust: true },
      "CAUTION",
    );
    expect(page.lowReliability).toContain("기질 문항의 응답이 한쪽으로 몰려");
    expect(page.crossCheck).toHaveLength(2);
    expect(page.crossCheck[0]).toContain("위험회피 점수와");
    expect(page.crossCheck[1]).toContain("학습 지속력과 학습 수행 점수가");
  });

  test("mixed type: TEMP_MIX_HEAD title, TEMP_MIXED_BODY, STR1 and CAU1 of both", () => {
    const mixed = scoreTemperament({
      q23: { items: Array(35).fill(2) as Likert[], verify: 3 },
      track: "H12",
      q20Item5: 2,
      exec: 50,
      recv: 50,
      reliability: { diagnosis: "GOOD", temperament: "NORMAL" },
    });
    const page = temperamentPage9(mixed, "NORMAL");
    expect(page.title).toContain("자극추구\u00b7위험회피 두 기질이");
    expect(page.hero.name).toBe("자극추구\u00b7위험회피 혼합형");
    expect(page.hero.body).toContain("두 기질이 비슷하게 나타나");
    expect(page.study.strengths).toEqual([
      "새 공부법\u00b7탐구 주제를 빨리 시도합니다.",
      "준비가 꼼꼼해 실수가 적습니다.",
    ]);
    expect(page.study.cautions).toHaveLength(2);
  });
});
