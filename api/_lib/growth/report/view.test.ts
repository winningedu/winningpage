import { describe, expect, it } from "vitest";
import {
  detailBody,
  listItem,
  openSummary,
  overviewFromStored,
  parseReportsQuery,
  planCounts,
  type StoredPlanItemRow,
  type StoredReportRow,
} from "./view.js";

function row(over: Partial<StoredReportRow> = {}): StoredReportRow {
  return {
    id: "r1",
    status: "completed",
    current_step: 8,
    track: "고2",
    narrative_theme: null,
    grade_subthemes: null,
    stage: null,
    axis_scores: null,
    consistency: null,
    sections: null,
    signals: null,
    issued_at: "2026-10-01T00:00:00Z",
    activity_ids: [],
    step_state: {},
    last_activity_at: "2026-10-02T00:00:00Z",
    created_at: "2026-09-30T00:00:00Z",
    ...over,
  };
}

describe("planCounts", () => {
  it("전체와 완료 수를 센다", () => {
    expect(
      planCounts([
        { status: "done" },
        { status: "pending" },
        { status: "done" },
      ]),
    ).toEqual({ total: 3, done: 2 });
    expect(planCounts([])).toEqual({ total: 0, done: 0 });
  });
});

describe("listItem", () => {
  it("목록 1건 모양으로 만든다", () => {
    expect(
      listItem(row({ narrative_theme: "생명공학" }), { total: 2, done: 1 }),
    ).toEqual({
      id: "r1",
      status: "completed",
      track: "고2",
      issuedAt: "2026-10-01T00:00:00Z",
      theme: "생명공학",
      lastActivityAt: "2026-10-02T00:00:00Z",
      plan: { total: 2, done: 1 },
    });
  });

  it("서사와 계획 집계가 없으면 null", () => {
    const item = listItem(row(), null);
    expect(item.theme).toBeNull();
    expect(item.plan).toBeNull();
  });
});

describe("openSummary", () => {
  it("진행 표시와 다음 단계를 담는다", () => {
    const summary = openSummary(
      row({
        status: "in_progress",
        current_step: 2,
        step_state: {
          steps: {
            1: { status: "ok", attempts: 1 },
            2: { status: "ok", attempts: 2 },
          },
        },
      }),
    );
    expect(summary.id).toBe("r1");
    expect(summary.currentStep).toBe(2);
    expect(summary.nextStep).toBe(3);
    expect(summary.terminal).toBeNull();
    expect(summary.progress).toHaveLength(8);
    expect(summary.progress[1]).toMatchObject({
      step: 2,
      status: "ok",
      attempts: 2,
    });
    expect(summary.progress[2]).toMatchObject({ step: 3, status: "pending" });
  });

  it("종결 실패를 그대로 돌려준다", () => {
    const terminal = { reason: "3단계 시도 상한 초과", at: "t", step: 3 };
    expect(openSummary(row({ step_state: { terminal } })).terminal).toEqual(
      terminal,
    );
  });
});

function axis(a: string, verdict: string, name: string) {
  return {
    axis: a,
    name,
    count: 1,
    required: 2,
    verdict,
    verdictLabel: "",
    guideline: "",
    optional: false,
    activityIds: [],
  };
}

const section12 = {
  id: "1-12",
  body: { estimate: 2.4, actual: 2.6, verdictLabel: "곡선 위" },
};

describe("overviewFromStored", () => {
  const base = {
    track: "고2" as const,
    consistency: { percent: 72, verdictLabel: "방향이 뚜렷해요" },
    axes: [
      axis("A", "confirmed", "전공 적합성"),
      axis("B", "confirmed", "탐구력"),
      axis("C", "confirmed", "협업"),
      axis("D", "confirmed", "성장"),
      axis("E", "confirmed", "인성"),
    ],
    sections: [section12],
    activities: [{ gradeLabel: "고1", semester: 1 }],
  };

  it("저장된 값에서 한눈에 입력을 만든다", () => {
    expect(overviewFromStored(base)).toMatchObject({
      consistencyPercent: 72,
      consistencyLabel: "방향이 뚜렷해요",
      axesConfirmed: 5,
      axesTotal: 5,
      weakestAxisText: null,
      estimate: "2.4",
      actual: "2.6",
      curveLabel: "곡선 위",
      recommendedDone: null,
      recommendedTotal: null,
      activityCount: 1,
    });
  });

  it("확인 안 된 축이 있으면 가장 급한 축 문구를 넣는다", () => {
    const axes = [...base.axes];
    axes[1] = { ...axes[1], verdict: "none", count: 0 } as never;
    const out = overviewFromStored({ ...base, axes });
    expect(out.axesConfirmed).toBe(4);
    expect(out.weakestAxisText).toBe("진로 및 전공적합성 보강이 가장 급해요");
  });

  it("깨진 값은 지어내지 않고 null 로 둔다", () => {
    const out = overviewFromStored({
      ...base,
      consistency: "oops",
      axes: [{ axis: 1 }],
      sections: [{ id: "1-12", body: "x" }, 7],
    });
    expect(out).toMatchObject({
      consistencyPercent: null,
      consistencyLabel: null,
      axesConfirmed: null,
      axesTotal: null,
      weakestAxisText: null,
      estimate: null,
      actual: null,
      curveLabel: null,
    });
    expect(
      overviewFromStored({ ...base, axes: null, sections: null }).axesTotal,
    ).toBeNull();
  });

  it("트랙이 없으면 끊긴 시기를 지어내지 않는다", () => {
    expect(
      overviewFromStored({ ...base, track: null, activities: [] })
        .brokenSemester,
    ).toBeNull();
  });

  it("1-12 에 성적이 없으면 estimate 도 null", () => {
    const out = overviewFromStored({
      ...base,
      sections: [
        {
          id: "1-12",
          body: { estimate: null, actual: 2.6, verdictLabel: "x" },
        },
      ],
    });
    expect(out.estimate).toBeNull();
    expect(out.actual).toBe("2.6");
  });

  it("활동이 없는 첫 학기를 끊긴 시기로 돌려준다", () => {
    expect(
      overviewFromStored({
        ...base,
        activities: [
          { gradeLabel: "고1", semester: 1 },
          { gradeLabel: "고1", semester: 1 },
        ],
      }).brokenSemester,
    ).toBe("고1-2");
    expect(
      overviewFromStored({
        ...base,
        activities: [
          { gradeLabel: "고1", semester: 1 },
          { gradeLabel: "고1", semester: 2 },
          { gradeLabel: "고2", semester: 1 },
          { gradeLabel: "고2", semester: 2 },
        ],
      }).brokenSemester,
    ).toBeNull();
  });
});

function plan(id: string, sortOrder: number): StoredPlanItemRow {
  return {
    id,
    program: "self",
    title: id,
    description: null,
    priority: "required",
    axis: null,
    category: null,
    period: "semester",
    period_label: null,
    deadline: null,
    status: "pending",
    done_source_program: null,
    done_at: null,
    carried_from_report_id: null,
    sort_order: sortOrder,
  };
}

describe("detailBody", () => {
  const sections = [
    section12,
    { id: "1-13", body: {} },
    { id: "1-4", body: {} },
    { id: "3-10", body: {} },
  ];
  const completed = row({
    narrative_theme: "생명공학",
    grade_subthemes: [{ grade: "고1", stage: "seed", text: "t" }],
    stage: "flower",
    consistency: { percent: 50, verdictLabel: "보통" },
    sections,
  });
  const plans = [plan("b", 2), plan("a", 1)];

  it("학생 본문은 섹션을 모두 담고 계획을 sort_order 순으로 정렬한다", () => {
    const body = detailBody(completed, plans, [], { parent: false });
    expect(body.sections.map((s) => (s as { id: string }).id)).toEqual([
      "1-12",
      "1-13",
      "1-4",
      "3-10",
    ]);
    expect(body.excludedSectionIds).toEqual([]);
    expect(body.planItems.map((p) => p.id)).toEqual(["a", "b"]);
    expect(plans.map((p) => p.id)).toEqual(["b", "a"]);
    expect(body.narrative).toEqual({
      theme: "생명공학",
      subthemes: [{ grade: "고1", stage: "seed", text: "t" }],
      stage: "flower",
    });
    expect(body.overview).toHaveLength(6);
    expect(body.progress).toHaveLength(8);
    expect(body.consistency).toEqual({ percent: 50, verdictLabel: "보통" });
  });

  it("학부모 본문은 성적 민감 섹션을 빼고 id 를 알려 준다", () => {
    const body = detailBody(completed, plans, [], { parent: true });
    expect(body.sections.map((s) => (s as { id: string }).id)).toEqual(["1-4"]);
    expect(body.excludedSectionIds).toEqual(["1-12", "1-13", "3-10"]);
    expect(body.consistency).toEqual({ percent: 50, verdictLabel: "보통" });
    const estimate = body.overview.find((c) => c.key === "estimate");
    expect(estimate?.value).toBe("자료 없음");
  });

  it("서사가 없으면 narrative 는 null, 섹션이 깨졌으면 빈 배열", () => {
    const body = detailBody(row({ sections: "bad" }), [], [], {
      parent: false,
    });
    expect(body.narrative).toBeNull();
    expect(body.sections).toEqual([]);
  });
});

describe("parseReportsQuery", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";

  it("쿼리가 없으면 목록, 학생 보기", () => {
    expect(parseReportsQuery({})).toEqual({
      ok: true,
      reportId: undefined,
      view: "student",
    });
  });

  it("UUID reportId 와 view=parent 를 받는다", () => {
    expect(parseReportsQuery({ reportId: id, view: "parent" })).toEqual({
      ok: true,
      reportId: id,
      view: "parent",
    });
    expect(parseReportsQuery({ reportId: id, view: "x" })).toMatchObject({
      ok: true,
      view: "student",
    });
  });

  it("UUID 가 아니거나 배열이면 거절한다", () => {
    expect(parseReportsQuery({ reportId: "abc" }).ok).toBe(false);
    expect(parseReportsQuery({ reportId: [id] }).ok).toBe(false);
    expect(parseReportsQuery({ reportId: "" }).ok).toBe(false);
  });
});
