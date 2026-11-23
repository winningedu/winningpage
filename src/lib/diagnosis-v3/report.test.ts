import { describe, expect, test } from "vitest";
import { scoreDiagnosisV3 } from "./index.js";
import { COPY_SHEETS, COPY_TEXT } from "./source/copyText.js";
import { CALC_EXAMPLE, CALC_EXAMPLE_CONTEXT } from "./testFixtures.js";
import type { DiagnosisV3Answers } from "./types.js";

const run = (answers: DiagnosisV3Answers = CALC_EXAMPLE) =>
  scoreDiagnosisV3(answers, CALC_EXAMPLE_CONTEXT);

/** 8번 all 보통 and no q10 pick: F5, 응답 단순 (17 r11, r14). */
const SIMPLE: DiagnosisV3Answers = {
  ...CALC_EXAMPLE,
  q9: { items: Array(15).fill(2), verify: 1 },
  q10: undefined,
};

const cell = (sheet: string, id: string, col: number) =>
  String(COPY_SHEETS[sheet]?.find((r) => r.c[0] === id)?.c[col]);

describe("1p 요약 (22 r9-r27)", () => {
  test("계산 예시: TYPE_9 head, summary and actions (계산 예시 D12)", () => {
    const { p1 } = run().pages;
    expect(p1.title).toBe(COPY_TEXT.TYPE_9_HEAD);
    expect(p1.typeSummary).toEqual({
      name: cell("01_유형문구", "TYPE_9_HEAD", 1),
      body: COPY_TEXT.TYPE_9_BODY,
    });
    expect(p1.lead).toBe(
      COPY_TEXT.SUM_LEAD?.replace("{one}", String(COPY_TEXT.NEXT_P1_LOG_개선)),
    );
    expect(p1.traitIntro).toBe(COPY_TEXT.TRAIT_INTRO);
    expect(p1.one).toEqual({
      title: COPY_TEXT.ONE_TITLE,
      actions: [
        COPY_TEXT.TYPE_9_ACT1,
        COPY_TEXT.TYPE_9_ACT2,
        COPY_TEXT.TYPE_9_ACT3,
      ],
    });
    expect(p1.profile.reliability).toBe(COPY_TEXT.RELIAB_GOOD);
  });

  test("계산 예시 KPIs: lowest stage 활동 기록 41 취약 (계산 예시 D7, D14)", () => {
    const { p1 } = run().pages;
    expect(p1.kpi1).toEqual({
      label: COPY_TEXT.KPI1_LABEL,
      area: { code: "P1_LOG", label: "활동 기록", score: 41, state: "취약" },
      subtitle: cell("04_진단서술", "NARR_P1_LOG_취약", 3),
    });
    expect(p1.kpi2.total).toBe(56.9);
    expect(p1.kpi2.sub).toBe(
      COPY_TEXT.KPI2_SUB?.replace("{area}", "탐구 심화").replace(
        "{score}",
        "26",
      ),
    );
    expect(p1.kpi3.area.code).toBe("MIND_RECV");
    expect(p1.kpi3.sub).toBe(
      COPY_TEXT.KPI3_SUB?.replace("{area}", "자기효능감").replace(
        "{score}",
        "75",
      ),
    );
    expect(p1.radar.stages.map((s) => s.score)).toEqual([
      83, 83, 50, 77, 41, 74, 65,
    ]);
    expect(p1.radar).toMatchObject({ total: 67, target: 75 });
    expect(p1.traits[0]).toEqual({
      heading: COPY_TEXT.TRAIT_TITLE_1?.replace("{area}", "활동 기록").replace(
        "{score}",
        "41",
      ),
      body: COPY_TEXT.AREA_P1_LOG_L5,
    });
    expect(p1.traits[1].body).toBe(COPY_TEXT.AREA_H12_DEEP_L5);
    expect(p1.traits[2].body).toBe(COPY_TEXT.AREA_MIND_RECV_L5);
  });

  test("계산 예시 profile (22 r12-r18)", () => {
    expect(run().pages.p1.profile).toEqual({
      grade: "고등학교 1학년",
      school: "자율형 사립고",
      target: "연세대학교 경영학과 \u00b7 학생부교과(추천형)",
      gpa: "1.4 (5등급제)",
      trend: "미입력",
      period:
        "11/9(월) ~ 12/6(일) \u00b7 " +
        COPY_TEXT["plan.redx"]?.replace("{date}", "12/7(월)"),
      temperament: COPY_TEXT.TEMP_TYPE_NS_NAME,
      reliability: COPY_TEXT.RELIAB_GOOD,
    });
  });

  test("응답 단순 skips the type (22 r9-r11, r18, r23, r27)", () => {
    const { p1 } = run(SIMPLE).pages;
    expect(p1.title).toBe(COPY_TEXT.SINCERITY_HEAD);
    expect(p1.typeSummary).toBeUndefined();
    expect(p1.lead).toBe(COPY_TEXT.SUM_LEAD_SIMPLE);
    expect(p1.traitIntro).toBe(COPY_TEXT.SINCERITY_TRAIT);
    expect(p1.profile.reliability).toBe(COPY_TEXT.SINCERITY_BANNER);
    const lowest = run(SIMPLE).scores.page1.order[0];
    expect(p1.one.actions).toEqual([
      COPY_TEXT.SINCERITY_ACT,
      COPY_TEXT["AREA_" + lowest + "_ACT1"],
    ]);
  });
});
