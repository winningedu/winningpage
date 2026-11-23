import { describe, expect, test } from "vitest";
import { scoreDiagnosisV3 } from "./index.js";
import { SCALE_ITEMS } from "./likert.js";
import { OPTIONS } from "./options.js";
import { COPY_SHEETS, COPY_TEXT } from "./source/copyText.js";
import {
  CALC_EXAMPLE,
  CALC_EXAMPLE_CONTEXT,
  validAnswers,
} from "./testFixtures.js";
import type { DiagnosisV3Answers } from "./types.js";

const run = (answers: DiagnosisV3Answers = CALC_EXAMPLE) =>
  scoreDiagnosisV3(answers, CALC_EXAMPLE_CONTEXT);

/** The answers without the given optional questions (exactOptionalPropertyTypes). */
const omit = (
  answers: DiagnosisV3Answers,
  ...keys: (keyof DiagnosisV3Answers)[]
): DiagnosisV3Answers =>
  Object.fromEntries(
    Object.entries(answers).filter(
      ([key]) => !keys.includes(key as keyof DiagnosisV3Answers),
    ),
  ) as DiagnosisV3Answers;

/** 8번 all 보통 and no q10 pick: F5, 응답 단순 (17 r11, r14). */
const SIMPLE: DiagnosisV3Answers = {
  ...omit(CALC_EXAMPLE, "q10"),
  q9: { items: Array(15).fill(2), verify: 1 },
};

/** V1 and V2 매우 그렇다: F1 + F2, 응답 단순 with the q10 picks kept (17 r6, r7, r14). */
const SIMPLE_PICKS: DiagnosisV3Answers = {
  ...CALC_EXAMPLE,
  q9: { ...CALC_EXAMPLE.q9, verify: 4 },
  q11: { ...CALC_EXAMPLE.q11, verify: 4 },
};

/** 21번 all 보통: F6, 기질 주의 (17 r12, r17). */
const CAUTION: DiagnosisV3Answers = {
  ...CALC_EXAMPLE,
  q23: { items: Array(35).fill(2), verify: 3 },
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
      area: {
        code: "P1_LOG",
        label: "활동 기록",
        score: 41,
        state: "취약",
        stateCode: "WEAK",
      },
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
      // 22 r16: Day 1, Day 28 and the re-diagnosis day, each plan.due
      period: { from: "11/9(월)", to: "12/6(일)", redx: "12/7(월)" },
      temperament: COPY_TEXT.TEMP_TYPE_NS_NAME,
      reliability: COPY_TEXT.RELIAB_GOOD,
    });
  });

  test("one verify flag is 보통 and shows RELIAB_MID (17 r15, 22 r18)", () => {
    const mid = run({ ...CALC_EXAMPLE, q9: { ...CALC_EXAMPLE.q9, verify: 4 } });
    expect(mid.scores.reliability.diagnosis).toBe("MID");
    expect(mid.pages.p1.profile.reliability).toBe(COPY_TEXT.RELIAB_MID);
  });

  test("KPI labels: KPI2_LABEL, KPI2_LABEL_M3 for 중3, KPI3_LABEL (22 r21-r22)", () => {
    const { p1 } = run().pages;
    expect(p1.kpi2.label).toBe(COPY_TEXT.KPI2_LABEL);
    expect(p1.kpi3.label).toBe(COPY_TEXT.KPI3_LABEL);
    expect(run(validAnswers("M3")).pages.p1.kpi2.label).toBe(
      COPY_TEXT.KPI2_LABEL_M3,
    );
  });

  const titled = (id: string, area: string, score: number) =>
    String(COPY_TEXT[id])
      .replace("{area}", area)
      .replace("{score}", String(score));

  test("trait titles below 70: TRAIT_TITLE_1, TRAIT_TITLE_2, TRAIT_TITLE_3 (22 r24-r26)", () => {
    const { traits } = run().pages.p1;
    expect(traits[0].heading).toBe(titled("TRAIT_TITLE_1", "활동 기록", 41));
    expect(traits[1].heading).toBe(titled("TRAIT_TITLE_2", "탐구 심화", 26));
    expect(traits[2].heading).toMatch(/^\u2462 마음 상태: /);
    expect(traits[2].heading).toBe(
      titled(
        "TRAIT_TITLE_3",
        run().pages.p1.kpi3.area.label,
        run().pages.p1.kpi3.area.score,
      ),
    );
  });

  test("trait titles at 70 or more: TRAIT_TITLE_1_OK and TRAIT_TITLE_2_OK (22 r24-r25)", () => {
    const high = run({
      ...omit(CALC_EXAMPLE, "q12"),
      q9: { items: Array(15).fill(4), verify: 1 },
      q11: { items: Array(12).fill(4), verify: 1 },
    }).pages.p1;
    expect(high.kpi1.area.score).toBeGreaterThanOrEqual(70);
    expect(high.traits[0].heading).toBe(
      titled("TRAIT_TITLE_1_OK", high.kpi1.area.label, high.kpi1.area.score),
    );
    const [, lowP2] = high.kpi2.sub.match(/: (.+) \d+점$/) ?? [];
    expect(high.traits[1].heading).toMatch(/^\u2461 학교생활 6개 영역이 모두/);
    expect(high.traits[1].heading).toContain(String(lowP2));
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
      ...omit(CALC_EXAMPLE, "q3Target"),
      q3: 6,
      q9,
    } as DiagnosisV3Answers).pages;
    expect(p2.reasons).toBeUndefined();
    expect(p2.ladder.text).toBe(COPY_TEXT.LADDER_GAP_MULTI);
    expect(p2.tips[1]).toBe(COPY_TEXT.LADDER_TIP_NEAR);
  });

  test("an NA cell highlights nothing and notes the NA name and desc by goal clarity", () => {
    const clear = run().pages.p2.matrix;
    expect(clear.highlighted).toBeUndefined();
    expect(clear.note).toEqual({
      name: COPY_TEXT.GOAL_Q_C_NA_NAME,
      desc: COPY_TEXT.GOAL_Q_C_NA_DESC,
    });
    const explore = run({ ...omit(CALC_EXAMPLE, "q3Target"), q3: 5 }).pages.p2
      .matrix;
    expect(explore.note).toEqual({
      name: COPY_TEXT.GOAL_Q_E_NA_NAME,
      desc: COPY_TEXT.GOAL_Q_E_NA_DESC,
    });
    const picked = run({
      ...omit(CALC_EXAMPLE, "q3Target"),
      q3: 5,
      q3r: [1, 3],
    }).pages.p2.matrix;
    expect(picked.note).toBeUndefined();
  });

  test("picked reasons highlight the cell and fill the chips", () => {
    const { p2 } = run({
      ...omit(CALC_EXAMPLE, "q3Target"),
      q3: 5,
      q3r: [1, 3],
    }).pages;
    expect(p2.matrix.highlighted).toBe("E_MIX");
    expect(p2.reasons).toMatchObject({ intrinsic: 1, extrinsic: 1 });
    expect(p2.reasons?.chips).toHaveLength(2);
    expect(p2.ladder.text).toBe(COPY_TEXT.LADDER_GAP_FAR);
  });
});

describe("3p 성적 (22 r38-r46)", () => {
  test("시험 운영 evidence: 8-15 answer word and the 10번 15 pick (spec row 76, PDF p4)", () => {
    const answer = CALC_EXAMPLE.q9.items[14] as number;
    const label = [
      "전혀 그렇지 않다",
      "별로 그렇지 않다",
      "보통이다",
      "대체로 그렇다",
      "매우 그렇다",
    ][answer];
    expect(run().pages.p3.examOpsEvidence).toEqual({
      item: "8-15",
      answer: label,
    });
    const picked = run({ ...CALC_EXAMPLE, q10: [15] }).pages.p3.examOpsEvidence;
    expect(picked).toEqual({
      item: "8-15",
      answer: label,
      examRoom: OPTIONS.q10.find((o) => o.ordinal === 15)?.label,
    });
    expect(picked.examRoom).toMatch(/^시험장에서/);
  });

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

describe("3p branches (22 r41, r46)", () => {
  test("6-2 better than 6 is GRD_RECENT_UP, equal is GRD_RECENT_SAME", () => {
    expect(run({ ...CALC_EXAMPLE, q6r: 1.2 }).pages.p3.recent).toBe(
      COPY_TEXT.GRD_RECENT_UP?.replace("{d}", "0.2"),
    );
    expect(run({ ...CALC_EXAMPLE, q6r: 1.4 }).pages.p3.recent).toBe(
      COPY_TEXT.GRD_RECENT_SAME,
    );
  });

  test("8-15 보통 without the 10번 15 pick is EXAMOPS_MID (21 C35)", () => {
    const items = [...CALC_EXAMPLE.q9.items];
    items[14] = 2;
    const r = run({ ...CALC_EXAMPLE, q9: { ...CALC_EXAMPLE.q9, items } });
    expect(r.scores.examOps).toBe("MID");
    expect(r.pages.p3.examOps.body).toBe(COPY_TEXT.EXAMOPS_MID);
  });
});

describe("4p 7단계 사이클 (22 r48-r53)", () => {
  test("lowest stage 45 to 69 gives CYC_HEAD_WEAK (22 r48)", () => {
    const { p4 } = run({
      ...CALC_EXAMPLE,
      q9: { items: Array(15).fill(3), verify: 1 },
    }).pages;
    const stages = p4.cycle.stages;
    const low = [...stages].sort((a, b) => a.score - b.score)[0];
    expect(low?.score).toBeGreaterThanOrEqual(45);
    expect(low?.score).toBeLessThan(70);
    const top2 = [...stages]
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((s) => "\u2018" + s.label + "\u2019")
      .join(", ");
    expect(p4.title).toBe(
      COPY_TEXT.CYC_HEAD_WEAK?.replace("{top2}", top2).replace(
        "{low}",
        String(low?.label),
      ),
    );
  });

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

describe("5p and 6p branches (22 r55, r60, r68)", () => {
  test("자기효능감 under 70 puts OBS_MIND_LOW in the title (22 r55)", () => {
    const r = run({
      ...CALC_EXAMPLE,
      q20: { items: [1, 1, 1, 2, 3, 2], verify: 2 },
    });
    expect(r.scores.mind.areas.MIND_EFF.score).toBeLessThan(70);
    expect(r.pages.p5.title).toContain(String(COPY_TEXT.OBS_MIND_LOW));
  });

  test("a picked area scoring 70 or more is XCHK_GAP (22 r60)", () => {
    const { p5 } = run({
      ...CALC_EXAMPLE,
      q9: { items: Array(15).fill(4), verify: 1 },
    }).pages;
    if (p5.crossCheck?.kind !== "items") throw new Error("expected items");
    const gap = p5.crossCheck.items.filter(
      (item) => item.text === COPY_TEXT.XCHK_GAP,
    );
    expect(gap.length).toBeGreaterThan(0);
    for (const item of gap) expect(item.area.score).toBeGreaterThanOrEqual(70);
  });

  test("one PAGE2 area at 60 or more shows STR_ONE (22 r68)", () => {
    const items = SCALE_ITEMS.q11.H12.map((item) =>
      item.area === "H12_SUBJ" ? 4 : 0,
    ) as DiagnosisV3Answers["q11"]["items"];
    const { p6 } = run({
      ...omit(CALC_EXAMPLE, "q12"),
      q11: { items, verify: 1 },
    }).pages;
    expect(p6.strengths).toHaveLength(1);
    expect(p6.strengthNote).toBe(COPY_TEXT.STR_ONE);
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
      stateCode: "WEAK",
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
    const none = run(omit(CALC_EXAMPLE, "q12")).pages.p6;
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
    const { p6 } = run({ ...omit(CALC_EXAMPLE, "q12"), q11 }).pages;
    expect(p6.strengths).toEqual([]);
    expect(p6.strengthNote).toBe(COPY_TEXT.STR_NONE);
    expect(p6.weaknesses).toHaveLength(4);
  });
});

describe("7p 입결 (22 r71-r77)", () => {
  test("계산 예시: BAND_4 위험 in basic mode, no number shown (계산 예시 D29)", () => {
    const { p7 } = run().pages;
    expect(p7?.title).toBe(COPY_TEXT.ADM_HEAD_4);
    if (p7?.result.kind !== "computed") throw new Error("expected computed");
    expect(p7.result.comparison).toEqual({
      cut70: { label: COPY_TEXT["cut_labels.cut70"], value: 1.28 },
      mine: { label: COPY_TEXT["cut_labels.mine"], value: 2.25 },
      diff: COPY_TEXT.diff_short?.replace("{v}", "0.97"),
      source: COPY_TEXT.admission_source
        ?.replace("{university}", "연세대학교")
        .replace("{major}", "경영학과")
        .replace("{type}", "학생부교과(추천형)")
        .replace("{year}", "2026"),
    });
    expect(p7.result.band).toEqual({
      headline: COPY_TEXT.admission_headline?.replace("{band}", "위험"),
      text: COPY_TEXT.BAND_4,
      precision: COPY_TEXT.BAND_PRECISION,
    });
    expect(p7.cards).toEqual([
      {
        question: "목표 전형의 수능 최저 기준을 맞출 수 있을 것 같나요?",
        answer: "목표 전형에 수능 최저가 없어요.",
        text: COPY_TEXT.ADM_Q16_4,
      },
      {
        question: "학생부종합전형 준비 상태는 어디에 가깝나요?",
        answer: "성적은 괜찮지만 탐구 활동이 부족해요.",
        text: COPY_TEXT.ADM_Q17_3,
      },
      {
        question: "면접 준비 상태는 어디에 가깝나요?",
        answer: "아직 해당 없음 (고1)",
        text: COPY_TEXT.ADM_Q18_6,
      },
    ]);
    const [when, text] = String(COPY_TEXT.ROAD_고1_1).split("|");
    expect(p7.roadmap.title).toBe(
      COPY_TEXT.ROAD_TITLE?.replace("{grade}", "고1"),
    );
    expect(p7.roadmap.steps).toHaveLength(3);
    expect(p7.roadmap.steps[0]).toEqual({ when, text });
    expect(p7.notes).toEqual([COPY_TEXT.ADMISSION_NOTE, COPY_TEXT.PROB_NOTE]);
  });

  test("17 ADM_LEAD is the 7p lead sentence (PDF p8)", () => {
    expect(run().pages.p7?.lead).toBe(COPY_TEXT.ADM_LEAD);
    expect(run(omit(CALC_EXAMPLE, "q15")).pages.p7?.lead).toBe(
      COPY_TEXT.ADM_LEAD,
    );
  });

  test("an unanswered card shows ADM_NA and carries no text (22 r75 D)", () => {
    const cards = run(omit(CALC_EXAMPLE, "q17")).pages.p7?.cards;
    expect(cards?.[1]).toEqual({
      question: "학생부종합전형 준비 상태는 어디에 가깝나요?",
      answer: COPY_TEXT.ADM_NA,
    });
  });

  test("M3 has no 7p; no target skips; no cut is NODATA (22 r70, r74)", () => {
    expect(run(validAnswers("M3")).pages.p7).toBeUndefined();
    const { q15: _q15, ...noTarget } = CALC_EXAMPLE;
    const skipped = run(noTarget).pages.p7;
    expect(skipped?.title).toBe(COPY_TEXT.ADM_HEAD_SKIP);
    expect(skipped?.result).toEqual({
      kind: "notice",
      text: COPY_TEXT.BAND_SKIPPED,
    });
    expect(skipped?.cards).toBeUndefined();
    const admission = {
      ...CALC_EXAMPLE_CONTEXT.admission,
      cut70: null,
    } as typeof CALC_EXAMPLE_CONTEXT.admission;
    const nodata = scoreDiagnosisV3(CALC_EXAMPLE, {
      ...CALC_EXAMPLE_CONTEXT,
      admission,
    }).pages.p7;
    expect(nodata?.title).toBe(COPY_TEXT.ADM_HEAD_NODATA);
    expect(nodata?.result).toEqual({
      kind: "notice",
      text: COPY_TEXT.BAND_NODATA,
      universityName: "연세대학교",
      unitName: "경영학과",
    });
  });

  test("mine equal to the 70% cut shows diff_base (22 r72)", () => {
    const p7 = scoreDiagnosisV3(CALC_EXAMPLE, {
      ...CALC_EXAMPLE_CONTEXT,
      admission: {
        ...(CALC_EXAMPLE_CONTEXT.admission as NonNullable<
          typeof CALC_EXAMPLE_CONTEXT.admission
        >),
        cut70: 2.25,
      },
    }).pages.p7;
    if (p7?.result.kind !== "computed") throw new Error("expected computed");
    expect(p7.result.comparison.diff).toBe(COPY_TEXT.diff_base);
  });

  test("precise mode shows both cuts with their gaps (22 r72)", () => {
    const admission = {
      ...CALC_EXAMPLE_CONTEXT.admission,
      cut50: 2.5,
      cut70: 2.8,
    } as typeof CALC_EXAMPLE_CONTEXT.admission;
    const p7 = scoreDiagnosisV3(CALC_EXAMPLE, {
      ...CALC_EXAMPLE_CONTEXT,
      admission,
    }).pages.p7;
    if (p7?.result.kind !== "computed") throw new Error("expected computed");
    expect(p7.result.comparison.cut50).toEqual({
      label: COPY_TEXT["cut_labels.cut50"],
      value: 2.5,
    });
    expect(p7.result.comparison.diff50).toBe(
      COPY_TEXT.diff_over?.replace("{v}", "0.25"),
    );
    expect(p7.result.comparison.diff).toBe(
      COPY_TEXT.diff_over?.replace("{v}", "0.55"),
    );
    expect(p7.result.band.precision).toBeUndefined();
  });
});

describe("8p-10p MBTI and 기질 (22 r79-r99)", () => {
  test("계산 예시: no MBTI, single NS hero, track rules (계산 예시 D30, D32)", () => {
    const { p8, p9, p10 } = run().pages;
    expect(p8.mbti.kind).toBe("none");
    expect(p8.disclaimer).toBe(COPY_TEXT.MBTI_DISCLAIMER);
    expect(p9.title).toBe(COPY_TEXT.TEMP_TYPE_NS_HEAD);
    expect(p9.lowReliability).toBeUndefined();
    if (p10.admission.kind !== "rules") throw new Error("expected rules");
    expect(p10.admission.areas.flatMap((a) => a.texts)).toEqual(
      [
        "T_AD_2",
        "T_AD_5",
        "T_AD_6",
        "T_PACE_2",
        "T_PACE_3",
        "T_SUBJ_0",
        "T_SUBJ_1",
      ].map((id) => COPY_TEXT[id]),
    );
  });

  test("기질 주의 adds TEMP_LOWREL and hides the rules; 응답 단순 hides them too", () => {
    const caution = run(CAUTION).pages;
    expect(caution.p9.lowReliability).toBe(COPY_TEXT.TEMP_LOWREL);
    expect(caution.p10.admission).toEqual({
      kind: "hidden",
      text: COPY_TEXT.TEMP_LOWREL,
    });
    expect(run(SIMPLE).pages.p10.admission).toEqual({
      kind: "hidden",
      text: COPY_TEXT.SINCERITY_BANNER,
    });
  });

  test("9p lead and scale note are TEMP_LEAD and TEMP_SCALE_NOTE (22 r87)", () => {
    const { p9 } = run().pages;
    expect(p9.lead).toBe(COPY_TEXT.TEMP_LEAD);
    expect(p9.scaleNote).toBe(COPY_TEXT.TEMP_SCALE_NOTE);
  });

  test("an MBTI answer fills the type card", () => {
    const { p8 } = run({ ...CALC_EXAMPLE, q22: "ESTJ" }).pages;
    expect(p8.mbti.kind).toBe("type");
  });
});

describe("11p 4주 플랜 and 12-15p 플래너 (22 r101-r113)", () => {
  test("계산 예시: urgency 보통, events and table (계산 예시 D28, D33)", () => {
    const { pages, scores } = run();
    const { p11, p12, p15 } = pages;
    expect(p11.title).toBe(COPY_TEXT.PLAN_HEAD);
    expect(p11.lead).toBe(COPY_TEXT.PLAN_LEAD);
    // PDF p11 "실행 긴급도 10점, 낮음": 22 B102 title and the points
    expect(p11.urgency).toEqual({
      title: "실행 긴급도",
      points: scores.urgency.points,
      label: cell("06_긴급도", "URG_L2", 1),
      text: COPY_TEXT.URG_L2,
    });
    expect(p11.events.kind).toBe("events");
    expect(p11.table.weeks.filter((w) => w.reduced).map((w) => w.week)).toEqual(
      [3],
    );
    expect(p11.checkpoints).toHaveLength(6);
    expect(p12.week).toBe(1);
    expect(p15.week).toBe(4);
  });

  test("style tips: temperament methods plus MBTI J/P and E/I tips, else hidden (22 r106)", () => {
    const methods = run().pages.p10.methods;
    const plain = run().pages.p11.styleTips;
    expect(plain).toEqual(methods.length > 0 ? methods : undefined);
    const withMbti = run({ ...CALC_EXAMPLE, q22: "ESTJ" }).pages.p11.styleTips;
    expect(withMbti).toEqual([
      ...methods,
      COPY_TEXT.MBTI_TIP_J,
      COPY_TEXT.MBTI_TIP_E,
    ]);
  });
});

/** HA 100, SD 0 and 불안\u00b7회복 24: TEMP_COUNSEL (18 r27). */
const COUNSEL: DiagnosisV3Answers = (() => {
  const items = [...CALC_EXAMPLE.q23.items];
  items.splice(5, 5, 4, 4, 4, 4, 0);
  items.splice(20, 5, 0, 0, 0, 0, 4);
  const q20Items = [...CALC_EXAMPLE.q20.items];
  q20Items.splice(4, 2, 4, 1);
  return {
    ...CALC_EXAMPLE,
    q20: { ...CALC_EXAMPLE.q20, items: q20Items },
    q23: { ...CALC_EXAMPLE.q23, items },
  };
})();

describe("16p 서비스 \u00b7 안내 (22 r115-r121)", () => {
  test("계산 예시: DEEP then GOAL cards, agenda and reading (계산 예시 D27)", () => {
    const { p16 } = run().pages;
    expect(p16.title).toBe(COPY_TEXT.SVC_HEAD_2);
    expect(p16.preferences).toEqual([
      "일주일에 한 번 공부 계획과 실천 결과를 점검받고 싶어요.",
      "교과 심화탐구의 주제와 방향을 설계받고 싶어요.",
    ]);
    expect(p16.services[0]).toEqual({
      code: "DEEP",
      name: "위닝 심화탐구",
      prefix: COPY_TEXT.SVC_RANK1_PREFIX,
      text: COPY_TEXT.SVC_DEEP_S2,
      tags: [3, 4, 5, 6].map((c) => cell("09_서비스태그", "DEEP", c)),
    });
    expect(p16.services[1]).toMatchObject({
      code: "GOAL",
      prefix: COPY_TEXT.SVC_RANK2_PREFIX?.replace("{영역}", "활동 기록"),
      text: COPY_TEXT.SVC_GOAL_S2,
    });
    expect(p16.scopeNote).toBeUndefined();
    expect(p16.agenda).toEqual([
      COPY_TEXT.AGENDA_P1?.replace("{area}", "활동 기록").replace(
        "{next}",
        String(COPY_TEXT.NEXT_P1_LOG_개선),
      ),
      COPY_TEXT.AGENDA_P2?.replace("{area}", "탐구 심화").replace(
        "{next}",
        String(COPY_TEXT.NEXT_H12_DEEP_개선),
      ),
      COPY_TEXT.AGENDA_ADM_4,
    ]);
    expect(p16.reading).toEqual([
      COPY_TEXT.READ_1,
      COPY_TEXT.READ_2,
      COPY_TEXT.READ_3,
      COPY_TEXT.READ_4,
      COPY_TEXT.READ_RELIAB?.replace("{label}", "양호").replace(
        "{text}",
        String(COPY_TEXT.RELIAB_GOOD),
      ),
      COPY_TEXT.READ_REDX?.replace("{date}", "12/7(월)"),
    ]);
    expect(p16.footer).toEqual([
      COPY_TEXT.REPORT_BASIS,
      COPY_TEXT.REPORT_LIMIT,
    ]);
  });

  test("17 SVC_LEAD is the 16p lead sentence (PDF p17)", () => {
    expect(run().pages.p16.lead).toBe(COPY_TEXT.SVC_LEAD);
  });

  test("응답 단순 and care titles; care pins CALL with its prefix (22 r115, r117)", () => {
    expect(run(SIMPLE).pages.p16.title).toBe(COPY_TEXT.SVC_HEAD_HIDDEN);
    const care = run(COUNSEL);
    expect(care.scores.services.counselPinned).toBe(true);
    expect(care.pages.p16.title).toBe(COPY_TEXT.SVC_HEAD_TEMP);
    expect(care.pages.p16.services[0]).toMatchObject({
      code: "CALL",
      prefix: COPY_TEXT.SVC_CALL_TEMP_PREFIX,
    });
  });

  test("N수 and 고3 후기 scope notes (07 C16-C21, 22 r118)", () => {
    const nsu = run({ ...validAnswers("H3"), q1: 6 }).pages.p16;
    expect(nsu.scope).toBe("NSU");
    expect(nsu.scopeNote).toBe(COPY_TEXT.SVC_NSU_LIMIT);
    const late = scoreDiagnosisV3(validAnswers("H3"), {
      ...CALC_EXAMPLE_CONTEXT,
      joinedAt: "2026-07-01",
    }).pages.p16;
    expect(late.scope).toBe("G3LATE");
    expect(late.scopeNote).toBe(COPY_TEXT.SVC_G3LATE_LIMIT);
  });

  test("M3 scope note and agenda; H3 prefers the 고3\u00b7N수 copy (22 r117-r119)", () => {
    const m3 = run(validAnswers("M3")).pages.p16;
    expect(m3.scopeNote).toBe(COPY_TEXT.SVC_M3_LIMIT);
    expect(m3.agenda[2]).toBe(COPY_TEXT.AGENDA_ADM_M3);
    const h3 = run(validAnswers("H3"));
    const card = h3.pages.p16.services.find(
      (s) => s.code !== "GOAL" && s.code !== "CALL",
    );
    if (card) {
      const band = h3.scores.services.ranked.find(
        (s) => s.code === card.code,
      )?.band;
      expect(card.text).toBe(
        COPY_TEXT["SVC_" + card.code + "_" + band + "@고3\u00b7N수"],
      );
    }
    expect(run(omit(CALC_EXAMPLE, "q15")).pages.p16.agenda[2]).toBe(
      COPY_TEXT.AGENDA_ADM_SKIP,
    );
  });
});

describe("표지 (22 r6-r7, judge-report R6)", () => {
  test("계산 예시 cover: inputs, 16-page toc from the 22 section rows, 1p headline", () => {
    const { cover, p1 } = run().pages;
    expect(cover.studentName).toBeUndefined();
    expect(cover).toMatchObject({
      gradeLabel: "고등학교 1학년",
      schoolTypeLabel: "자율형 사립고",
      diagnosedAt: "2026-11-09",
      headline: p1.title,
      stages: p1.radar.stages,
      basis: COPY_TEXT.REPORT_BASIS,
    });
    expect(cover.toc.map((t) => t.page)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
    expect(cover.toc[0]?.title).toBe("요약");
    expect(cover.toc[6]?.title).toBe("입결");
    expect(cover.toc[11]?.title).toBe(cover.toc[14]?.title);
  });

  test("cover stages carry the 4p break marks (22 r50 under 45, PDF p1 red marks)", () => {
    const { cover, p4 } = run().pages;
    expect(cover.stages).toEqual(p4.cycle.stages);
    expect(cover.stages.filter((s) => s.broken).map((s) => s.code)).toEqual([
      "P1_LOG",
    ]);
  });

  test("M3 drops page 7 from the toc; a profile name is shown", () => {
    const m3 = scoreDiagnosisV3(validAnswers("M3"), {
      ...CALC_EXAMPLE_CONTEXT,
      studentName: "김위닝",
    }).pages.cover;
    expect(m3.toc.map((t) => t.page)).not.toContain(7);
    expect(m3.toc).toHaveLength(15);
    expect(m3.studentName).toBe("김위닝");
  });
});
