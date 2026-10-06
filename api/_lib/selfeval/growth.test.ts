import { describe, expect, it } from "vitest";
import {
  bannerSummary,
  directionMismatch,
  extractGrowthSnapshot,
  type GrowthReportRowLike,
  matchPlanItems,
  type PlanItemRowLike,
  pickPlanItem,
  stageLabel,
} from "./growth.js";
import type { GrowthPlanItemRef, GrowthSnapshot } from "./types.js";

const report = (o: Partial<GrowthReportRowLike> = {}): GrowthReportRowLike => ({
  id: "rep1",
  issued_at: "2026-09-01T00:00:00Z",
  narrative_theme: "통계로 사회 문제를 해석하는 학생",
  grade_subthemes: [
    { grade: "고1", stage: "seed", text: "자료 읽기" },
    { grade: "고2", stage: "flower", text: "통계 해석" },
    { grade: "고3", stage: "nope", text: "버려질 항목" },
    "이상한 값",
  ],
  stage: "flower",
  axis_scores: [
    {
      axis: "A",
      name: "교과 역량",
      count: 1,
      required: 3,
      guideline: "교과 심화 탐구",
    },
    {
      axis: "B",
      name: "탐구",
      count: 3,
      required: 3,
      guideline: "탐구 보고서",
    },
  ],
  signals: {
    match: {
      aligned: [{ text: "통계 해석 활동이 일관됨", evidenceIds: [] }],
      conflicting: [{ text: "진로와 다른 방향의 동아리", evidenceIds: [] }],
    },
  },
  ...o,
});

const plan = (o: Partial<PlanItemRowLike> = {}): PlanItemRowLike => ({
  id: "p1",
  title: "통계 보고서 쓰기",
  description: null,
  axis: "A",
  category: "수학",
  program: "self",
  status: "pending",
  ...o,
});

describe("extractGrowthSnapshot", () => {
  it("issued_at 이 없으면 null", () => {
    expect(extractGrowthSnapshot(report({ issued_at: null }), [])).toBeNull();
  });
  it("이상한 부제 항목과 잘못된 단계는 버린다", () => {
    const s = extractGrowthSnapshot(report(), []);
    expect(s?.gradeSubthemes).toEqual([
      { grade: "고1", stage: "seed", text: "자료 읽기" },
      { grade: "고2", stage: "flower", text: "통계 해석" },
    ]);
    expect(s?.stage).toBe("flower");
  });
  it("단계가 seed, flower, bloom 이 아니면 null", () => {
    expect(extractGrowthSnapshot(report({ stage: "x" }), [])?.stage).toBeNull();
  });
  it("부족 축만 weakAxes", () => {
    const s = extractGrowthSnapshot(report(), []);
    expect(s?.weakAxes).toEqual([
      {
        axis: "A",
        name: "교과 역량",
        count: 1,
        required: 3,
        guideline: "교과 심화 탐구",
      },
    ]);
  });
  it("신호 문장을 꺼낸다", () => {
    const s = extractGrowthSnapshot(report(), []);
    expect(s?.alignedSignals).toEqual(["통계 해석 활동이 일관됨"]);
    expect(s?.conflictingSignals).toEqual(["진로와 다른 방향의 동아리"]);
  });
  it("signals 나 axis_scores 가 이상해도 빈 배열", () => {
    const s = extractGrowthSnapshot(
      report({ signals: null, axis_scores: "x", grade_subthemes: null }),
      [],
    );
    expect(s?.alignedSignals).toEqual([]);
    expect(s?.weakAxes).toEqual([]);
    expect(s?.gradeSubthemes).toEqual([]);
  });
  it("계획 항목은 self 이고 pending 만", () => {
    const s = extractGrowthSnapshot(report(), [
      plan(),
      plan({ id: "p2", program: "school" }),
      plan({ id: "p3", status: "done" }),
    ]);
    expect(s?.planItems.map((p) => p.id)).toEqual(["p1"]);
    expect(s?.planItems[0]?.axis).toBe("A");
  });
  it("모르는 axis 값은 null", () => {
    const s = extractGrowthSnapshot(report(), [plan({ axis: "Z" })]);
    expect(s?.planItems[0]?.axis).toBeNull();
  });
});

describe("stageLabel", () => {
  it("라벨을 돌려주고 null 이면 null", () => {
    expect(stageLabel("seed")).toBe("씨앗");
    expect(stageLabel("bloom")).toBe("만개");
    expect(stageLabel(null)).toBeNull();
  });
});

const snap = (o: Partial<GrowthSnapshot> = {}): GrowthSnapshot => ({
  ...(extractGrowthSnapshot(report(), []) as GrowthSnapshot),
  ...o,
});
const item = (o: Partial<GrowthPlanItemRef> = {}): GrowthPlanItemRef => ({
  id: "p1",
  title: "t",
  description: null,
  axis: null,
  category: "수학",
  ...o,
});

describe("matchPlanItems", () => {
  const ctx = {
    area: "subject" as const,
    subject: "수학Ⅱ",
    activityName: null,
  };
  it("category 가 과목명과 같으면(로마 숫자 무시) 후보", () => {
    expect(matchPlanItems(snap({ planItems: [item()] }), ctx)).toHaveLength(1);
  });
  it("category 에 과목명이 들어 있으면 후보", () => {
    const s = snap({ planItems: [item({ category: "수학 심화 탐구" })] });
    expect(matchPlanItems(s, ctx)).toHaveLength(1);
  });
  it("영역 라벨과 같으면 후보", () => {
    const s = snap({ planItems: [item({ category: "동아리" })] });
    expect(
      matchPlanItems(s, { area: "club", subject: null, activityName: null }),
    ).toHaveLength(1);
  });
  it("axis 가 부족 축이면 후보", () => {
    const s = snap({ planItems: [item({ category: "국어", axis: "A" })] });
    expect(matchPlanItems(s, ctx)).toHaveLength(1);
  });
  it("관계없으면 제외", () => {
    const s = snap({ planItems: [item({ category: "국어", axis: "B" })] });
    expect(matchPlanItems(s, ctx)).toEqual([]);
  });
});

describe("pickPlanItem", () => {
  it("0개 none, 1개 auto, 2개 이상 choose", () => {
    expect(pickPlanItem([])).toEqual({ mode: "none" });
    const a = item({ id: "a" });
    const b = item({ id: "b" });
    expect(pickPlanItem([a])).toEqual({ mode: "auto", item: a });
    expect(pickPlanItem([a, b])).toEqual({ mode: "choose", items: [a, b] });
  });
});

describe("directionMismatch", () => {
  const ctx = {
    area: "subject" as const,
    subject: "영어Ⅰ",
    activityName: null,
  };
  it("방향에 과목이 없고 계획 후보도 없으면 true", () => {
    expect(directionMismatch(snap(), ctx, [])).toBe(true);
  });
  it("방향 문장에 과목 낱말이 있으면 false", () => {
    expect(directionMismatch(snap(), { ...ctx, subject: "통계" }, [])).toBe(
      false,
    );
  });
  it("계획 후보가 있으면 false", () => {
    expect(directionMismatch(snap(), ctx, [item()])).toBe(false);
  });
  it("과목이 없으면 영역 라벨로 본다", () => {
    expect(
      directionMismatch(
        snap({ narrativeTheme: "동아리 리더십" }),
        { area: "club", subject: null, activityName: null },
        [],
      ),
    ).toBe(false);
  });
});

describe("bannerSummary", () => {
  it("배너용 값을 만든다", () => {
    expect(bannerSummary(snap())).toEqual({
      theme: "통계로 사회 문제를 해석하는 학생",
      stageLabel: "꽃",
      currentSubtheme: "통계 해석",
      weakAxisNames: ["교과 역량"],
      issuedAt: "2026-09-01T00:00:00Z",
    });
  });
  it("currentGrade 가 있으면 그 학년 부제", () => {
    expect(bannerSummary(snap(), "고1").currentSubtheme).toBe("자료 읽기");
  });
  it("currentGrade 부제가 없으면 stage 가 같은 첫 부제", () => {
    const s = snap({
      stage: "seed",
      gradeSubthemes: [
        { grade: "고1", stage: "seed", text: "첫째" },
        { grade: "고2", stage: "flower", text: "둘째" },
      ],
    });
    expect(bannerSummary(s, "고3").currentSubtheme).toBe("첫째");
    expect(bannerSummary(s).currentSubtheme).toBe("첫째");
  });
  it("stage 도 안 맞으면 가장 높은 학년 부제", () => {
    const s = snap({ stage: "bloom" });
    expect(bannerSummary(s).currentSubtheme).toBe("통계 해석");
  });
  it("부제가 없으면 currentSubtheme null", () => {
    expect(
      bannerSummary(snap({ gradeSubthemes: [], stage: null })).currentSubtheme,
    ).toBeNull();
  });
});
