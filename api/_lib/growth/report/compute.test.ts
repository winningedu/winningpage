import { describe, expect, it } from "vitest";
import { evaluateAxes } from "../axes.js";
import { computeConsistency } from "../consistency.js";
import {
  type Narrative,
  NO_DATA_TEXT,
  SECTION_REGISTRY,
  validateSectionItem,
} from "../sections.js";
import { ADMISSION_DISCLAIMER } from "../targetGrade.js";
import {
  appSections,
  axisEvidence,
  classify,
  computeStep5,
  computeStep6,
  consistencyActivities,
  representativeAxes,
} from "./compute.js";
import type {
  ActivitySignal,
  ContextActivity,
  ReportContext,
} from "./types.js";

const act = (
  id: string,
  over: Partial<ContextActivity> = {},
): ContextActivity => ({
  id,
  sourceProgram: "manual",
  gradeLabel: "고1",
  semester: 1,
  subjectGroup: "수학",
  subject: null,
  topic: `주제${id}`,
  text: "본문",
  group: "curricular",
  ...over,
});

const sig = (
  id: string,
  over: Partial<ActivitySignal> = {},
): ActivitySignal => ({
  activityId: id,
  axes: [],
  method: null,
  keywords: [],
  linkage: [],
  summary: `요약${id}`,
  ...over,
});

const ctx = (over: Partial<ReportContext> = {}): ReportContext => ({
  reportId: "r1",
  profileId: "p1",
  track: "고2",
  currentGrade: "고2",
  range: {
    semesters: ["고1-1", "고1-2", "고2-1"],
    description: "고1부터 고2 1학기",
  },
  omitted: { ids: [], reasons: [] },
  expectedSectionIds: [],
  noFirstYearData: false,
  activities: [],
  evidenceIds: [],
  survey: {},
  profile: {
    schoolType: "일반고",
    grade: "고2",
    semester: 1,
    career: "의사",
    admissionYear: 2025,
  },
  grades: { system: null, semesters: [], note: null },
  universities: [],
  previousNarrative: null,
  nowIso: "2026-10-06T00:00:00.000Z",
  ...over,
});

const narrative: Narrative = {
  theme: "생명을 설계하는 사람",
  subthemes: [
    { grade: "고1", stage: "seed", text: "관찰" },
    { grade: "고2", stage: "flower", text: "탐구" },
    { grade: "고3", stage: "bloom", text: "확장" },
  ],
};

const emptyOutputs = (
  context: ReportContext,
  signals: ActivitySignal[] = [],
) => ({
  classification: classify(context),
  narrative: null,
  consistency: computeConsistency([]),
  axes: evaluateAxes(context.currentGrade, []),
  signals,
});

const find = (items: { id: string }[], id: string) =>
  items.find((i) => i.id === id) as ReturnType<typeof appSections>[number];

describe("classify", () => {
  it("학년은 0건이어도 고1~고3 행을 둔다", () => {
    const c = classify(ctx({ activities: [act("a")] }));
    expect(c.byGrade).toEqual([
      { grade: "고1", count: 1 },
      { grade: "고2", count: 0 },
      { grade: "고3", count: 0 },
    ]);
  });

  it("학기는 range 순서를 따르고 과목군은 건수 내림차순, 동률은 이름순", () => {
    const c = classify(
      ctx({
        activities: [
          act("1", { subjectGroup: "영어", semester: 2 }),
          act("2", { subjectGroup: "국어", semester: 2 }),
          act("3", { subjectGroup: "수학", semester: 1 }),
          act("4", { subjectGroup: "수학", semester: 1 }),
          act("5", { subjectGroup: null, group: "unclassified" }),
        ],
      }),
    );
    expect(c.bySemester.map((s) => s.key)).toEqual(["고1-1", "고1-2", "고2-1"]);
    expect(c.bySemester.map((s) => s.count)).toEqual([3, 2, 0]);
    expect(c.bySubjectGroup).toEqual([
      { subjectGroup: "수학", count: 2 },
      { subjectGroup: "국어", count: 1 },
      { subjectGroup: "영어", count: 1 },
    ]);
    expect(c.byGroup).toEqual({
      curricular: 4,
      extracurricular: 0,
      unclassified: 1,
    });
  });

  it("범위 밖 학기만 outOfRangeIds, null 은 범위 안으로 본다", () => {
    const c = classify(
      ctx({
        activities: [
          act("in"),
          act("out", { gradeLabel: "고3", semester: 1 }),
          act("nullGrade", { gradeLabel: null }),
          act("nullSem", { semester: null }),
        ],
      }),
    );
    expect(c.outOfRangeIds).toEqual(["out"]);
  });
});

describe("representativeAxes", () => {
  it("상위 2개, 동률은 A~E 순", () => {
    const s = [
      sig("1", { axes: ["C", "A"] }),
      sig("2", { axes: ["C", "B"] }),
      sig("3", { axes: ["E"] }),
    ];
    expect(representativeAxes(s)).toEqual(["C", "A"]);
  });
  it("0건이면 빈 배열", () => {
    expect(representativeAxes([sig("1")])).toEqual([]);
  });
});

describe("consistency", () => {
  const context = ctx({ activities: [act("1"), act("2"), act("3")] });
  const signals = [
    sig("1", { axes: ["A"], linkage: ["subject_link"] }),
    sig("2", { axes: ["A", "B"] }),
    sig("3", { axes: ["E"] }),
  ];

  it("연계 신호를 옮기고 대표 축과 겹치면 axis_match 를 더한다", () => {
    const list = consistencyActivities(context, signals);
    expect(list[0]).toEqual({
      id: "1",
      signals: ["subject_link", "axis_match"],
      evidence: "요약1",
    });
    expect(list[1]?.signals).toEqual(["axis_match"]);
    expect(list[2]?.signals).toEqual([]);
  });

  it("signals 가 없는 활동은 신호 없음", () => {
    const list = consistencyActivities(context, []);
    expect(list.every((a) => a.signals.length === 0)).toBe(true);
    expect(list[0]).toEqual({ id: "1", signals: [] });
  });

  it("computeStep5 는 일관성 결과를 돌려준다", () => {
    const r = computeStep5(context, signals);
    expect(r.consistency.total).toBe(3);
    expect(r.consistency.formula).toContain("%");
  });
});

describe("axes", () => {
  it("활동 하나에 축이 여럿이면 축마다 1건", () => {
    expect(axisEvidence([sig("1", { axes: ["A", "B"] })])).toEqual([
      { activityId: "1", axis: "A" },
      { activityId: "1", axis: "B" },
    ]);
  });

  it("computeStep6 은 현재 학년 활동만 센다", () => {
    const context = ctx({
      currentGrade: "고2",
      activities: [
        act("g1", { gradeLabel: "고1" }),
        act("g2", { gradeLabel: "고2" }),
      ],
    });
    const result = computeStep6(context, [
      sig("g1", { axes: ["A"] }),
      sig("g2", { axes: ["A", "C"] }),
    ]);
    expect(result.find((r) => r.axis === "A")?.count).toBe(1);
    expect(result.find((r) => r.axis === "C")?.count).toBe(1);
    expect(result).toHaveLength(5);
  });
});

describe("appSections 기본", () => {
  it("모든 생성 항목이 validateSectionItem 과 레지스트리 형식을 통과한다", () => {
    const context = ctx({
      activities: [act("a1"), act("a2", { semester: 2 })],
      grades: {
        system: "nine",
        semesters: [
          { key: "고1-1", average: 3, source: "direct" },
          { key: "고1-2", average: 2.8, source: "direct" },
          { key: "고2-1", average: 2.2, source: "direct" },
        ],
        note: null,
      },
      universities: [
        {
          universityName: "가대",
          departmentName: "의예과",
          cuts: [
            { year: 2025, grade: 1.5 },
            { year: 2024, grade: 1.7 },
          ],
        },
      ],
    });
    const out = {
      ...emptyOutputs(context, [sig("a1", { axes: ["A"] })]),
      narrative,
    };
    const items = appSections(context, out);
    expect(items.map((i) => i.id)).toEqual([
      "1-1",
      "1-3",
      "1-4",
      "1-5",
      "1-12",
      "1-13",
      "1-14",
      "3-1",
      "3-8",
      "3-9",
      "3-10",
    ]);
    for (const item of items) {
      expect(validateSectionItem(item).ok).toBe(true);
      const def = SECTION_REGISTRY.find((d) => d.id === item.id);
      expect(item.format).toBe(def?.format);
      expect(item.badge).toBe(def?.badge);
    }
    for (const id of ["1-3", "1-5", "3-1"]) {
      expect(find(items, id).evidence_ids).toEqual(["a1", "a2"]);
    }
    for (const id of ["1-1", "1-4", "1-12", "1-13", "1-14", "3-10"]) {
      expect(find(items, id).evidence_ids).toEqual([]);
    }
  });

  it("1-5 근거는 과목이 확인된 활동만 든다", () => {
    const context = ctx({
      activities: [act("a1"), act("a2", { subjectGroup: null })],
    });
    const item = find(appSections(context, emptyOutputs(context)), "1-5");
    expect(item.evidence_ids).toEqual(["a1"]);
  });

  it("3-1 근거는 저장된 1-8 섹션의 근거를 받고, 1-8 이 없으면 활동 전체다", () => {
    const context = ctx({ activities: [act("a1"), act("a2"), act("a3")] });
    const sec18 = {
      id: "1-8",
      title: "반복된 문제의식",
      format: "list" as const,
      badge: "fact" as const,
      status: "ok" as const,
      evidence_ids: ["a2"],
      body: [],
    };
    const withSec = appSections(context, {
      ...emptyOutputs(context),
      narrative,
      sections: [sec18],
    });
    expect(find(withSec, "3-1").evidence_ids).toEqual(["a2"]);
    const without = appSections(context, {
      ...emptyOutputs(context),
      narrative,
      sections: [],
    });
    expect(find(without, "3-1").evidence_ids).toEqual(["a1", "a2", "a3"]);
  });

  it("활동이 0건이면 서사가 있어도 3-1 은 no_data", () => {
    const context = ctx({ activities: [] });
    const item = find(
      appSections(context, { ...emptyOutputs(context), narrative }),
      "3-1",
    );
    expect(item.status).toBe("no_data");
    expect(item.evidence_ids).toEqual([]);
  });

  it("제외 항목은 만들지 않는다", () => {
    const context = ctx({
      omitted: { ids: ["1-12", "3-10", "1-1"], reasons: [] },
      activities: [act("a")],
    });
    const ids = appSections(context, emptyOutputs(context)).map((i) => i.id);
    expect(ids).not.toContain("1-12");
    expect(ids).not.toContain("3-10");
    expect(ids).not.toContain("1-1");
    expect(ids).toContain("1-4");
  });

  it("1-1 은 null 값을 자료 없음 행으로 둔다", () => {
    const context = ctx({
      activities: [act("a")],
      profile: {
        schoolType: null,
        grade: null,
        semester: null,
        career: null,
        admissionYear: null,
      },
    });
    const item = find(appSections(context, emptyOutputs(context)), "1-1");
    const rows = (item.body as { rows: { label: string; value: string }[] })
      .rows;
    expect(rows.map((r) => r.label)).toEqual([
      "학교 유형",
      "학년과 학기",
      "진로",
      "희망 대학",
      "트랙",
      "분석 범위",
    ]);
    expect(rows.find((r) => r.label === "학교 유형")?.value).toBe(NO_DATA_TEXT);
    expect(rows.find((r) => r.label === "희망 대학")?.value).toBe(NO_DATA_TEXT);
    expect(rows.find((r) => r.label === "트랙")?.value).toBe("고2");
  });

  it("1-1 희망 대학은 최대 2개", () => {
    const u = (n: string) => ({
      universityName: n,
      departmentName: "학과",
      cuts: [],
    });
    const context = ctx({ universities: [u("가"), u("나"), u("다")] });
    const item = find(appSections(context, emptyOutputs(context)), "1-1");
    const rows = (item.body as { rows: { label: string; value: string }[] })
      .rows;
    const v = rows.find((r) => r.label === "희망 대학")?.value ?? "";
    expect(v).toContain("가");
    expect(v).toContain("나");
    expect(v).not.toContain("다");
  });

  it("1-3 노드는 학기 순이고 축을 붙인다", () => {
    const context = ctx({
      activities: [
        act("late", { gradeLabel: "고2", semester: 1 }),
        act("early", { gradeLabel: "고1", semester: 2 }),
      ],
    });
    const item = find(
      appSections(
        context,
        emptyOutputs(context, [sig("early", { axes: ["B"] })]),
      ),
      "1-3",
    );
    const nodes = (item.body as { nodes: { id: string; axes: string[] }[] })
      .nodes;
    expect(nodes.map((n) => n.id)).toEqual(["early", "late"]);
    expect(nodes[0]?.axes).toEqual(["B"]);
    expect(nodes[1]?.axes).toEqual([]);
  });

  it("1-4 는 고1~고3 막대 3개, 1-5 는 과목군 막대", () => {
    const context = ctx({
      activities: [act("a"), act("b", { subjectGroup: "국어" })],
    });
    const items = appSections(context, emptyOutputs(context));
    expect((find(items, "1-4").body as { bars: unknown[] }).bars).toEqual([
      { label: "고1", value: 2 },
      { label: "고2", value: 0 },
      { label: "고3", value: 0 },
    ]);
    expect((find(items, "1-5").body as { bars: unknown[] }).bars).toEqual([
      { label: "국어", value: 1 },
      { label: "수학", value: 1 },
    ]);
  });
});

describe("appSections 자료 없음 분기", () => {
  it("성적이 없으면 1-12, 1-13, 3-10 은 no_data", () => {
    const context = ctx({
      activities: [act("a")],
      universities: [
        {
          universityName: "가대",
          departmentName: null,
          cuts: [{ year: 2025, grade: 2 }],
        },
      ],
    });
    const items = appSections(context, emptyOutputs(context));
    for (const id of ["1-12", "1-13", "3-10"]) {
      const it = find(items, id);
      expect(it.status).toBe("no_data");
      expect(it.no_data_reason).toBeTruthy();
      expect(validateSectionItem(it).ok).toBe(true);
    }
    expect(find(items, "1-14").status).toBe("no_data");
  });

  it("평균이 모두 null 이면 성적 없음으로 본다", () => {
    const context = ctx({
      grades: {
        system: "nine",
        semesters: [{ key: "고1-1", average: null, source: null }],
        note: null,
      },
    });
    expect(
      find(appSections(context, emptyOutputs(context)), "1-12").status,
    ).toBe("no_data");
  });

  it("대학이 없으면 1-14, 3-10 은 no_data", () => {
    const context = ctx({
      grades: {
        system: "nine",
        semesters: [{ key: "고1-1", average: 3, source: "direct" }],
        note: null,
      },
    });
    const items = appSections(context, emptyOutputs(context));
    expect(find(items, "1-12").status).toBe("ok");
    expect(find(items, "1-14").status).toBe("no_data");
    expect(find(items, "3-10").status).toBe("no_data");
  });

  it("컷이 모두 비면 1-14 는 no_data", () => {
    const context = ctx({
      grades: {
        system: "nine",
        semesters: [{ key: "고1-1", average: 3, source: "direct" }],
        note: null,
      },
      universities: [
        { universityName: "가대", departmentName: null, cuts: [] },
      ],
    });
    expect(
      find(appSections(context, emptyOutputs(context)), "1-14").status,
    ).toBe("no_data");
  });

  it("narrative 가 없으면 3-1 은 no_data, 3-8 3-9 는 항상 no_data", () => {
    const context = ctx();
    const items = appSections(context, emptyOutputs(context));
    expect(find(items, "3-1").status).toBe("no_data");
    for (const id of ["3-8", "3-9"]) {
      const it = find(items, id);
      expect(it.status).toBe("no_data");
      expect(it.body).toEqual({
        text: NO_DATA_TEXT,
        reason: "권장과목, 인재상 자료가 아직 없어요",
      });
    }
  });

  it("3-1 은 서사 하위 주제를 단계 라벨과 함께 담는다", () => {
    const context = ctx({ activities: [act("a")] });
    const items = appSections(context, { ...emptyOutputs(context), narrative });
    const body = find(items, "3-1").body as {
      theme: string;
      subthemes: { grade: string; stageLabel: string; text: string }[];
    };
    expect(body.theme).toBe(narrative.theme);
    expect(body.subthemes.map((s) => s.stageLabel)).toEqual([
      "씨앗",
      "꽃",
      "만개",
    ]);
  });
});

describe("appSections 성적 계열", () => {
  const context = ctx({
    activities: [act("a")],
    grades: {
      system: "nine",
      semesters: [
        { key: "고1-1", average: 3, source: "direct" },
        { key: "고1-2", average: 3, source: "direct" },
        { key: "고2-1", average: 2, source: "direct" },
      ],
      note: null,
    },
    universities: [
      {
        universityName: "가대",
        departmentName: "의예과",
        cuts: [
          { year: 2025, grade: 2.0 },
          { year: 2024, grade: 2.4 },
        ],
      },
      {
        universityName: "나대",
        departmentName: null,
        cuts: [{ year: 2025, grade: 1.8 }],
      },
    ],
  });
  const items = appSections(context, emptyOutputs(context));

  it("1-12 는 점, 실제 평균, 판정을 담는다", () => {
    const body = find(items, "1-12").body as {
      points: { key: string; average: number }[];
      actual: number;
      estimate: number;
      verdict: string;
    };
    expect(body.points).toHaveLength(3);
    expect(body.actual).toBe(2.67);
    expect(body.verdict).toBe("rising");
    expect(body.estimate).toBe(2.37);
  });

  it("1-13 은 내부 추정 문구와 고지를 note 에 둔다", () => {
    const item = find(items, "1-13");
    const note = (item.body as { note: string }).note;
    expect(note).toContain("내부 추정");
    expect(note).toContain(ADMISSION_DISCLAIMER);
  });

  it("1-14 는 대학마다 행을 만들고 고지를 단다", () => {
    const body = find(items, "1-14").body as {
      rows: { university: string; latest: number | null }[];
      note: string;
    };
    expect(body.rows.map((r) => r.university)).toEqual(["가대 의예과", "나대"]);
    expect(body.rows[0]?.latest).toBe(2);
    expect(body.note).toContain(ADMISSION_DISCLAIMER);
  });

  it("3-10 은 가장 좋은 최신 컷으로 남은 학기를 역산한다", () => {
    const body = find(items, "3-10").body as {
      targetCut: number;
      rows: { key: string; target: number | null }[];
      requiredAverage: number | null;
    };
    expect(body.targetCut).toBe(1.8);
    expect(body.rows.map((r) => r.key)).toEqual(["고2-2", "고3-1", "고3-2"]);
    // (1.8 * 6 - 8) / 3
    expect(body.requiredAverage).toBe(0.93);
  });
});
