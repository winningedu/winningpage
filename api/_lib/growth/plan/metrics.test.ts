import { describe, expect, test } from "vitest";
import {
  planMetrics,
  readProjectionCurrent,
  toProjectionItems,
} from "./metrics.js";
import type { PlanItemRow, PlanReportRow } from "./types.js";

function axisScores(counts: [number, number, number, number, number]) {
  return (["A", "B", "C", "D", "E"] as const).map((axis, i) => ({
    axis,
    name: axis,
    count: counts[i],
  }));
}

function report(over: Partial<PlanReportRow> = {}): PlanReportRow {
  return {
    id: "r1",
    profile_id: "p1",
    status: "issued",
    track: "고2",
    narrative_theme: null,
    grade_subthemes: null,
    stage: null,
    consistency: { linked: 7, total: 14, percent: 50 },
    axis_scores: axisScores([1, 2, 0, 0, 1]),
    sections: null,
    issued_at: null,
    ...over,
  };
}

describe("readProjectionCurrent", () => {
  test("일관성, 축별 개수, 학년을 읽는다", () => {
    expect(readProjectionCurrent(report())).toEqual({
      consistency: { linked: 7, total: 14 },
      axisCounts: { A: 1, B: 2, C: 0, D: 0, E: 1 },
      grade: "고2",
    });
  });

  test("졸업과 N수는 고3으로 본다", () => {
    expect(readProjectionCurrent(report({ track: "졸업" }))?.grade).toBe("고3");
    expect(readProjectionCurrent(report({ track: "N수" }))?.grade).toBe("고3");
  });

  test("트랙이 없으면 null", () => {
    expect(readProjectionCurrent(report({ track: null }))).toBeNull();
  });

  test("일관성 모양이 깨지면 null", () => {
    expect(readProjectionCurrent(report({ consistency: null }))).toBeNull();
    expect(
      readProjectionCurrent(
        report({ consistency: { linked: "7", total: 14 } }),
      ),
    ).toBeNull();
  });

  test("축 점수가 배열이 아니거나 축이 빠지면 null", () => {
    expect(readProjectionCurrent(report({ axis_scores: {} }))).toBeNull();
    expect(
      readProjectionCurrent(
        report({ axis_scores: axisScores([1, 1, 1, 1, 1]).slice(0, 4) }),
      ),
    ).toBeNull();
    expect(
      readProjectionCurrent(
        report({
          axis_scores: [
            { axis: "A", count: -1 },
            ...axisScores([0, 0, 0, 0, 0]).slice(1),
          ],
        }),
      ),
    ).toBeNull();
  });
});

function item(over: Partial<PlanItemRow> = {}): PlanItemRow {
  return {
    id: "i1",
    report_id: "r1",
    profile_id: "p1",
    program: "school",
    title: "t",
    description: null,
    priority: "required",
    axis: null,
    category: null,
    period: "semester",
    period_label: null,
    deadline: null,
    status: "pending",
    done_source_program: null,
    done_ref_id: null,
    done_at: null,
    carried_from_report_id: null,
    sort_order: 0,
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

describe("toProjectionItems", () => {
  test("축이 있으면 [axis], 없으면 [], 연계 true, done 은 status 로", () => {
    expect(
      toProjectionItems([
        item({ id: "a", axis: "B", status: "done" }),
        item({ id: "b", axis: null }),
      ]),
    ).toEqual([
      { id: "a", axes: ["B"], linksToTheme: true, done: true },
      { id: "b", axes: [], linksToTheme: true, done: false },
    ]);
  });
});

describe("planMetrics", () => {
  const rows = [
    item({ id: "a", axis: "B", status: "done" }),
    item({ id: "b", axis: "B" }),
    item({ id: "c", axis: "B" }),
    item({ id: "d", axis: "B" }),
  ];

  test("깨진 스냅샷이면 null", () => {
    expect(planMetrics(report({ consistency: null }), rows)).toBeNull();
  });

  test("항목이 없으면 세 시점이 같고 바뀐 축이 없다", () => {
    const m = planMetrics(report(), []);
    expect(m?.now).toEqual(m?.atReport);
    expect(m?.afterAll).toEqual(m?.atReport);
    expect(m?.changedAxesNow).toEqual([]);
    expect(m?.changedAxesAfterAll).toEqual([]);
  });

  test("리포트 시점은 스냅샷 그대로다", () => {
    const m = planMetrics(report(), rows);
    expect(m?.atReport.consistency).toEqual({
      percent: 50,
      verdictLabel: "갈리는 중",
    });
    expect(m?.atReport.axes.find((a) => a.axis === "B")).toEqual({
      axis: "B",
      name: "진로 및 전공적합성",
      count: 2,
      verdictLabel: "주의",
    });
  });

  test("지금은 완료 항목만, 전부 완료 시는 모든 항목을 더한다", () => {
    const m = planMetrics(report(), rows);
    // 지금: 완료 1건 추가, 8/15
    expect(m?.now.axes.find((a) => a.axis === "B")?.count).toBe(3);
    expect(m?.now.consistency.percent).toBeCloseTo(53.3, 1);
    // 전부: 4건 추가, 11/18, B 6건(고2 필요 4건 이상)
    expect(m?.afterAll.axes.find((a) => a.axis === "B")).toMatchObject({
      count: 6,
      verdictLabel: "확인됨",
    });
    expect(m?.afterAll.consistency.percent).toBeCloseTo(61.1, 1);
    expect(m?.afterAll.consistency.verdictLabel).toBe("뚜렷함");
    expect(m?.changedAxesNow).toEqual([]);
    expect(m?.changedAxesAfterAll).toEqual(["B"]);
  });
});
