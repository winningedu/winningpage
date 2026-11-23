import { describe, expect, test } from "vitest";
import { scoreDiagnosisV3 } from "./index.js";
import { SCALE_ITEMS } from "./likert.js";
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

/** V1 and V2 매우 그렇다: F1 + F2, 응답 단순 with the q10 picks kept (17 r6, r7, r14). */
const SIMPLE_PICKS: DiagnosisV3Answers = {
  ...CALC_EXAMPLE,
  q9: { ...CALC_EXAMPLE.q9, verify: 4 },
  q11: { ...CALC_EXAMPLE.q11, verify: 4 },
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

describe("2p 목표 (22 r30-r36)", () => {
  test("계산 예시: C_NA cell, full ladder, no highlight", () => {
    const { p2 } = run().pages;
    expect(p2.title).toBe(COPY_TEXT.GOAL_Q_C_NA_HEAD);
    expect(p2.lead).toBe(COPY_TEXT.GOAL_LEAD);
    expect(p2.specificity).toMatchObject({
      selectedIndex: 0,
      university: "연세대학교",
      major: "경영학과",
    });
    expect(p2.specificity.options).toHaveLength(6);
    expect(p2.reasons).toEqual({ chips: [], intrinsic: 0, extrinsic: 0 });
    expect(p2.matrix.cells.map((c) => c.cell)).toEqual([
      "C_IN",
      "C_MIX",
      "C_EX",
      "E_IN",
      "E_MIX",
      "E_EX",
    ]);
    expect(p2.matrix.cells[0]).toEqual({
      cell: "C_IN",
      name: COPY_TEXT.GOAL_Q_C_IN_NAME,
      desc: COPY_TEXT.GOAL_Q_C_IN_DESC,
    });
    expect(p2.matrix.highlighted).toBeUndefined();
    expect(p2.ladder).toEqual({
      far: true,
      mid: true,
      near: true,
      text: COPY_TEXT.LADDER_FULL,
    });
    expect(p2.tips).toEqual([
      COPY_TEXT.GOAL_Q_C_NA_TIP,
      COPY_TEXT.LADDER_TIP_FULL,
    ]);
  });

  test("hidden 3-1 and empty rungs pick GAP_MULTI and the nearest tip", () => {
    const q9 = {
      ...CALC_EXAMPLE.q9,
      items: [3, 0, ...CALC_EXAMPLE.q9.items.slice(2)],
    };
    const { p2 } = run({
      ...CALC_EXAMPLE,
      q3: 6,
      q3Target: undefined,
      q9,
    } as DiagnosisV3Answers).pages;
    expect(p2.reasons).toBeUndefined();
    expect(p2.ladder.text).toBe(COPY_TEXT.LADDER_GAP_MULTI);
    expect(p2.tips[1]).toBe(COPY_TEXT.LADDER_TIP_NEAR);
  });

  test("picked reasons highlight the cell and fill the chips", () => {
    const { p2 } = run({
      ...CALC_EXAMPLE,
      q3: 5,
      q3Target: undefined,
      q3r: [1, 3],
    }).pages;
    expect(p2.matrix.highlighted).toBe("E_MIX");
    expect(p2.reasons).toMatchObject({ intrinsic: 1, extrinsic: 1 });
    expect(p2.reasons?.chips).toHaveLength(2);
    expect(p2.ladder.text).toBe(COPY_TEXT.LADDER_GAP_FAR);
  });
});

describe("3p 성적 (22 r38-r46)", () => {
  test("계산 예시: no flow, no subjects, exam ops OK", () => {
    const { p3 } = run().pages;
    expect(p3.title).toBe(COPY_TEXT.GRD_HEAD_NA);
    expect(p3.lead).toBe(COPY_TEXT.GRD_LEAD);
    expect(p3.gpa).toBe("1.4 (5등급제)");
    expect(p3.recent).toBe(COPY_TEXT.GRD_RECENT_NA);
    expect(p3.trend).toBe("미입력");
    expect(p3.bars).toBeUndefined();
    expect(p3.subjects).toEqual({
      kind: "skip",
      note: COPY_TEXT.SUBJ_SKIP_NOTE,
    });
    expect(p3.examOps).toEqual({
      heading: COPY_TEXT.EXAMOPS_TITLE,
      body: COPY_TEXT.EXAMOPS_OK,
    });
  });

  test("PDF p3 grades: subject table, recent gap and exam ops RISK", () => {
    const { p3 } = run({
      ...CALC_EXAMPLE,
      q6: 1.25,
      q6r: 1.33,
      q6s: { KOR: 1, MATH: 1.5, ENG: 1.5, SOC: 1.25 },
      q8: 5,
      q8s: 2,
      q8d: 2,
      q10: [15],
    }).pages;
    expect(p3.title).toBe(COPY_TEXT.GRD_HEAD_5);
    expect(p3.recent).toBe(COPY_TEXT.GRD_RECENT_DOWN?.replace("{d}", "0.08"));
    expect(p3.trend).toBe("과목마다 오르내림이 커요 \u00b7 수학 내려갔어요");
    expect(p3.bars?.school).toEqual([
      { subject: "KOR", grade: 1 },
      { subject: "MATH", grade: 1.5 },
      { subject: "ENG", grade: 1.5 },
      { subject: "SOC", grade: 1.25 },
    ]);
    expect(p3.bars?.mock).toBeUndefined();
    expect(p3.subjects).toEqual({
      kind: "table",
      rows: [
        { subject: "KOR", verdict: "STRENGTH", text: COPY_TEXT.SUBJ_J1_강점 },
        { subject: "MATH", verdict: "CHECK", text: COPY_TEXT.SUBJ_J1_점검 },
        { subject: "ENG", verdict: "CHECK", text: COPY_TEXT.SUBJ_J1_점검 },
        { subject: "SOC", verdict: "KEEP", text: COPY_TEXT.SUBJ_J1_유지 },
      ],
      note: COPY_TEXT.SUBJ_RULE_NOTE,
    });
    expect(p3.examOps.body).toBe(COPY_TEXT.EXAMOPS_RISK);
  });
});

const quote = (label: string) => "\u2018" + label + "\u2019";

describe("4p 7단계 사이클 (22 r48-r53)", () => {
  test("계산 예시: BREAK head, bottom three NARR, why 기록 (계산 예시 D14)", () => {
    const { p4 } = run().pages;
    expect(p4.title).toBe(
      COPY_TEXT.CYC_HEAD_BREAK?.replace(
        "{top2}",
        quote("목표 설정") + ", " + quote("우선순위"),
      ).replace("{low}", "활동 기록"),
    );
    expect(p4.lead).toBe(COPY_TEXT.CYC_LEAD);
    expect(p4.scoreNote).toBe(COPY_TEXT.CYC_SCORE_NOTE);
    expect(p4.breaks).toEqual(
      ["NARR_P1_LOG_취약", "NARR_P1_PLAN_보완", "NARR_P1_ADJ_보통"].map(
        (id) => ({
          heading: cell("04_진단서술", id, 3),
          body: COPY_TEXT[id],
        }),
      ),
    );
    expect(p4.why).toEqual({
      heading: COPY_TEXT.CYC_WHY_TITLE,
      body: COPY_TEXT.CYCLE_WHY,
    });
    expect(p4.cycle.stages.filter((s) => s.broken).map((s) => s.code)).toEqual([
      "P1_LOG",
    ]);
    expect(p4.cycle).toMatchObject({
      total: 67,
      gradeText: COPY_TEXT.GRADE_PAGE1_ALL_L3,
      caption: COPY_TEXT.HEX_CAPTION,
    });
  });

  test("계산 예시 처방표: lever 기록, 8-9 별로 to 대체로 linked to Day 2 (계산 예시 D25)", () => {
    const { rx } = run().pages.p4;
    expect(rx.intro).toBe(COPY_TEXT.RX_INTRO);
    expect(rx.lever).toBe(COPY_TEXT.LEVER_P1_LOG);
    if (rx.weak.kind !== "items") throw new Error("expected weak items");
    expect(rx.weak.items[0]).toEqual({
      question: SCALE_ITEMS.q9[8]?.text,
      target: COPY_TEXT["rx.target"]
        ?.replace("{cur}", "별로 그렇지 않다")
        .replace("{tgt}", "대체로 그렇다"),
      link: "11/10(화) " + COPY_TEXT.AREA_P1_LOG_ACT1,
    });
    expect(rx.strong.length).toBeGreaterThan(0);
    expect(rx.strong[0]?.answer).toBe("대체로 그렇다");
  });

  test("all stages 70+ give STABLE and no break or why", () => {
    const high = {
      ...CALC_EXAMPLE,
      q9: { items: Array(15).fill(4), verify: 1 },
      q10: [16],
    } as DiagnosisV3Answers;
    const { p4 } = run(high).pages;
    expect(p4.title).toBe(COPY_TEXT.CYC_HEAD_STABLE);
    expect(p4.why).toBeUndefined();
    expect(p4.cycle.stages.some((s) => s.broken)).toBe(false);
    expect(p4.rx.weak).toEqual({ kind: "none", text: COPY_TEXT.RX_NONE_WEAK });
    expect(p4.rx.lever).toBeUndefined();
  });
});

describe("5p 방해 요인 \u00b7 마음 상태 (22 r55-r61)", () => {
  test("계산 예시: picked areas, mind lines and cross check", () => {
    const { p5 } = run().pages;
    expect(p5.title).toBe(
      COPY_TEXT.OBS_HEAD_SEL?.replace(
        "{areas}",
        [quote("계획 수립"), quote("활동 기록"), quote("불안\u00b7회복")].join(
          ", ",
        ),
      ).replace("{mind}", String(COPY_TEXT.OBS_MIND_HIGH)),
    );
    expect(p5.lead).toBe(COPY_TEXT.OBS_LEAD);
    expect(p5.groups).toHaveLength(7);
    expect(p5.groups[2]?.options).toHaveLength(3);
    expect(
      p5.groups.flatMap((g) => g.options).filter((o) => o.selected),
    ).toHaveLength(3);
    expect(p5.mind.note).toBe(COPY_TEXT.MIND_NOTE);
    expect(p5.mind.bars.map((b) => b.score)).toEqual([75, 63, 41]);
    expect(p5.interpretation).toEqual({
      areas: [
        COPY_TEXT.AREA_MIND_EFF_L2,
        COPY_TEXT.AREA_MIND_GROW_L3,
        COPY_TEXT.AREA_MIND_RECV_L5,
      ],
      weak: COPY_TEXT.AREA_MIND_RECV_WEAK,
    });
    if (p5.crossCheck?.kind !== "items") throw new Error("expected items");
    expect(
      p5.crossCheck.items.map((i) => [i.area.code, i.answers.length, i.text]),
    ).toEqual([
      ["P1_PLAN", 2, COPY_TEXT.XCHK_MATCH],
      ["P1_LOG", 2, COPY_TEXT.XCHK_MATCH],
      ["MIND_RECV", 2, COPY_TEXT.XCHK_MATCH],
    ]);
    expect(p5.crossCheck.items[0]?.answers[0]).toEqual({
      question: SCALE_ITEMS.q9[4]?.text,
      answer: "보통이다",
    });
  });

  test("no pick or the exclusive pick skips the cross check (22 r55, r61)", () => {
    const { p5 } = run({ ...CALC_EXAMPLE, q10: [16] }).pages;
    expect(p5.title).toBe(
      COPY_TEXT.OBS_HEAD_NONE?.replace(
        "{mind}",
        String(COPY_TEXT.OBS_MIND_HIGH),
      ),
    );
    expect(p5.crossCheck).toEqual({
      kind: "skipped",
      text: COPY_TEXT.OBS_NONE_NOTE,
    });
    expect(run(SIMPLE).pages.p5.crossCheck?.kind).toBe("skipped");
  });

  test("응답 단순 with picks hides the cross check (22 r60)", () => {
    expect(run(SIMPLE_PICKS).pages.p5.crossCheck).toBeUndefined();
  });
});

describe("6p 학교생활 \u00b7 입시 준비도 (22 r63-r69)", () => {
  test("계산 예시: picked areas overlap the bottom two", () => {
    const { p6 } = run().pages;
    expect(p6.title).toBe(
      COPY_TEXT.SCH_HEAD_OVERLAP?.replace(
        "{areas}",
        quote("탐구 심화") + ", " + quote("입시 전략"),
      ),
    );
    expect(p6.lead).toBe(COPY_TEXT.SCH_LEAD);
    expect(p6.bars.areas.map((a) => a.code)).toEqual(run().scores.page2.order);
    expect(p6.bars.areas[0]).toEqual({
      code: "H12_DEEP",
      label: "탐구 심화",
      score: 26,
      state: "우선 보완",
    });
    expect(p6.bars).toMatchObject({
      total: 56.9,
      gradeText: COPY_TEXT.GRADE_PAGE2_H12_L4,
    });
    expect(p6.hardest?.map((h) => h.area)).toEqual([
      "탐구 심화",
      "탐구 심화",
      "입시 전략",
    ]);
    expect(p6.overlap).toBe(COPY_TEXT.SCH_OVERLAP_ALL);
    expect(p6.strengths.map((s) => s.body)).toHaveLength(3);
    expect(p6.strengthNote).toBeUndefined();
    expect(p6.weaknesses).toEqual([
      { heading: "탐구 심화", body: COPY_TEXT.AREA_H12_DEEP_WEAK },
      { heading: "입시 전략", body: COPY_TEXT.AREA_H12_STRA_WEAK },
    ]);
  });

  test("계산 예시 처방표: 11-5 별로 one step to 보통 (계산 예시 D26)", () => {
    const { rx } = run().pages.p6;
    expect(rx.lever).toBe(COPY_TEXT.LEVER_H12_DEEP);
    if (rx.weak.kind !== "items") throw new Error("expected weak items");
    expect(rx.weak.items[0]).toEqual({
      question: SCALE_ITEMS.q11.H12[4]?.text,
      target: COPY_TEXT["rx.target"]
        ?.replace("{cur}", "별로 그렇지 않다")
        .replace("{tgt}", "보통이다"),
      link: "11/14(토) " + COPY_TEXT.AREA_H12_DEEP_ACT1,
    });
  });

  test("no pick, a pick off the bottom two, a partial overlap", () => {
    const none = run({ ...CALC_EXAMPLE, q12: undefined }).pages.p6;
    expect(none.title).toBe(
      COPY_TEXT.SCH_HEAD_NONE?.replace("{low}", "탐구 심화"),
    );
    expect(none.overlap).toBe(COPY_TEXT.SCH_OVERLAP_NONE);
    expect(none.hardest).toBeUndefined();
    // 11-1, 11-2 매우: 교과 관리 stays high with one 12번 check
    const q11 = {
      ...CALC_EXAMPLE.q11,
      items: [4, 4, ...CALC_EXAMPLE.q11.items.slice(2)],
    };
    const diff = run({ ...CALC_EXAMPLE, q11, q12: [1] } as DiagnosisV3Answers)
      .pages.p6;
    expect(diff.title).toBe(
      COPY_TEXT.SCH_HEAD_DIFF?.replace("{low}", "탐구 심화"),
    );
    expect(diff.overlap).toBe(COPY_TEXT.SCH_OVERLAP_NO);
    expect(
      run({ ...CALC_EXAMPLE, q11, q12: [5, 1] } as DiagnosisV3Answers).pages.p6
        .overlap,
    ).toBe(COPY_TEXT.SCH_OVERLAP_PART);
  });

  test("no area at 60 or more shows STR_NONE (22 r68)", () => {
    const q11 = {
      items: Array(12).fill(1),
      verify: 1,
    } as DiagnosisV3Answers["q11"];
    const { p6 } = run({ ...CALC_EXAMPLE, q11, q12: undefined }).pages;
    expect(p6.strengths).toEqual([]);
    expect(p6.strengthNote).toBe(COPY_TEXT.STR_NONE);
    expect(p6.weaknesses).toHaveLength(4);
  });
});
