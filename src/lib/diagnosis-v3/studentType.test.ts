import { describe, expect, test } from "vitest";
import { P1_CODES } from "./codes.js";
import { scoreReliability } from "./reliability.js";
import { scoreAreas } from "./scoring.js";
import { COPY_SHEETS } from "./source/copyText.js";
import { SCORE_SHEETS } from "./source/scoreSheets.js";
import { studentType } from "./studentType.js";
import { CALC_EXAMPLE } from "./testFixtures.js";
import type { AreaScore } from "./types.js";

const GOOD = scoreReliability(CALC_EXAMPLE);
const area = (score: number) => ({ score }) as AreaScore;

/** Every PAGE1 area and 불안 회복 at 65 unless overridden. */
const scoresWith = (
  overrides: Partial<Record<(typeof P1_CODES)[number] | "MIND_RECV", number>>,
) => {
  const base = scoreAreas(CALC_EXAMPLE);
  const p1 = Object.fromEntries(
    P1_CODES.map((code) => [code, area(overrides[code] ?? 65)]),
  ) as typeof base.page1.areas;
  const total = Math.min(...Object.values(p1).map((a) => a.score));
  return {
    ...base,
    page1: { ...base.page1, areas: p1, total },
    mind: {
      ...base.mind,
      areas: { ...base.mind.areas, MIND_RECV: area(overrides.MIND_RECV ?? 65) },
    },
  };
};

describe("student type (06 r25-r33, spec No 48-57)", () => {
  test("계산 예시 A12: 7순위 기록 단절형 = TYPE_9", () => {
    expect(
      studentType(scoreAreas(CALC_EXAMPLE), scoreReliability(CALC_EXAMPLE)),
    ).toBe(9);
  });

  test("응답 단순 skips the verdict (06 A24)", () => {
    const simple = { ...GOOD, diagnosis: "SIMPLE" as const };
    expect(studentType(scoreAreas(CALC_EXAMPLE), simple)).toBeNull();
  });

  test.each([
    [
      "1순위 all PAGE1 and total 70",
      {
        P1_GOAL: 70,
        P1_PRIO: 70,
        P1_PLAN: 70,
        P1_EXEC: 70,
        P1_LOG: 70,
        P1_PATT: 70,
        P1_ADJ: 70,
      },
      1,
    ],
    ["2순위 불안 회복 49, 학습 수행 59", { MIND_RECV: 49, P1_EXEC: 59 }, 2],
    ["3순위 목표 설정 49", { P1_GOAL: 49 }, 3],
    ["4순위 계획 수립 60, 학습 수행 49", { P1_PLAN: 60, P1_EXEC: 49 }, 4],
    ["5순위 목표 설정 70, 학습 수행 59", { P1_GOAL: 70, P1_EXEC: 59 }, 5],
    ["6순위 우선순위 49, 학습 수행 50", { P1_PRIO: 49, P1_EXEC: 50 }, 6],
    ["7순위 활동 기록 49, 패턴 분석 69", { P1_LOG: 49, P1_PATT: 69 }, 9],
    ["8순위 학습 수행 60, 패턴 분석 54", { P1_EXEC: 60, P1_PATT: 54 }, 7],
    ["9순위 ELSE", {}, 8],
    [
      "1순위 misses with one stage at 69",
      {
        P1_GOAL: 70,
        P1_PRIO: 70,
        P1_PLAN: 70,
        P1_EXEC: 70,
        P1_LOG: 70,
        P1_PATT: 70,
        P1_ADJ: 69,
      },
      8,
    ],
    [
      "the first match wins: 2순위 before 3순위",
      { MIND_RECV: 49, P1_EXEC: 59, P1_GOAL: 49 },
      2,
    ],
  ] as const)("%s", (_name, overrides, expected) => {
    expect(studentType(scoresWith(overrides), GOOD)).toBe(expected);
  });

  test("the coded rules still read the same in 06 C25-C33", () => {
    const rows = (SCORE_SHEETS["06_임계값"] ?? []).filter(
      (row) => row.c[0] === "유형",
    );
    expect(rows.map((row) => row.c[2])).toEqual([
      "ALL_P1 >= 70 AND [종합] >= 70",
      "[불안\u00b7회복] < 50 AND [학습 수행] < 60",
      "[목표 설정] < 50",
      "[계획 수립] >= 60 AND [학습 수행] < 50",
      "[목표 설정] >= 70 AND [학습 수행] < 60",
      "[우선순위] < 50 AND [학습 수행] >= 50",
      "[활동 기록] < 50 AND MIN([패턴 분석],[피드백\u00b7조정]) < 70",
      "[학습 수행] >= 60 AND [패턴 분석] < 55",
      "ELSE",
    ]);
  });

  test("06 B type names equal the 01_유형문구 names of their TYPE ids", () => {
    const copyName = (id: string) =>
      (COPY_SHEETS["01_유형문구"] ?? []).find(
        (row) => row.c[0] === `${id}_HEAD`,
      )?.c[1];
    const rows = (SCORE_SHEETS["06_임계값"] ?? []).filter(
      (row) => row.c[0] === "유형",
    );
    for (const row of rows) {
      const name = String(row.c[1]).replace(/^\d순위 /, "");
      expect(copyName(String(row.c[3]))).toBe(name);
    }
    expect(rows.map((row) => row.c[3])).toEqual([
      "TYPE_1",
      "TYPE_2",
      "TYPE_3",
      "TYPE_4",
      "TYPE_5",
      "TYPE_6",
      "TYPE_9",
      "TYPE_7",
      "TYPE_8",
    ]);
  });
});
