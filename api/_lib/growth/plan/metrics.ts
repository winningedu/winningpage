// 성장설계 실행계획 지표 재계산(No.158, No.162). 순수 함수.
// 지표는 저장하지 않고 조회 때 리포트 스냅샷과 완료 항목으로 계산한다.
// No.158 의 "권장과목 이수", "독서 기록" 두 지표는 1차 자료(리포트 스냅샷)에 없어 넣지 않는다.

import { AXES, AXIS_NAMES } from "../axes.js";
import {
  type ProjectionInput,
  type ProjectionItem,
  projectCompletion,
} from "../projection.js";
import type { Axis, HighGrade } from "../types.js";
import type { PlanItemRow, PlanReportRow } from "./types.js";

export type MetricSnapshot = {
  consistency: { percent: number | null; verdictLabel: string | null };
  axes: { axis: Axis; name: string; count: number; verdictLabel: string }[];
};

export type PlanMetrics = {
  atReport: MetricSnapshot;
  now: MetricSnapshot;
  afterAll: MetricSnapshot;
  changedAxesNow: Axis[];
  changedAxesAfterAll: Axis[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function gradeOf(track: PlanReportRow["track"]): HighGrade | null {
  if (track === "고1" || track === "고2" || track === "고3") return track;
  if (track === "졸업" || track === "N수") return "고3";
  return null;
}

/** 리포트 스냅샷에서 예측 입력의 현재값을 읽는다. 모양이 다르면 null. */
export function readProjectionCurrent(
  report: PlanReportRow,
): ProjectionInput["current"] | null {
  const grade = gradeOf(report.track);
  if (grade === null) return null;

  const { consistency, axis_scores: axisScores } = report;
  if (!isRecord(consistency)) return null;
  const { linked, total } = consistency;
  if (!isCount(linked) || !isCount(total)) return null;

  if (!Array.isArray(axisScores)) return null;
  const axisCounts = {} as Record<Axis, number>;
  for (const axis of AXES) {
    const found = axisScores.find(
      (entry) => isRecord(entry) && entry.axis === axis,
    );
    if (!isRecord(found) || !isCount(found.count)) return null;
    axisCounts[axis] = found.count;
  }

  return { consistency: { linked, total }, axisCounts, grade };
}

/**
 * 실행계획 항목을 예측 입력으로 바꾼다.
 * 가정: 실행계획 항목은 서사(주제)에서 나왔으므로 완료되면 연계 활동으로 센다(linksToTheme true).
 */
export function toProjectionItems(rows: PlanItemRow[]): ProjectionItem[] {
  return rows.map((row) => ({
    id: row.id,
    axes: row.axis === null ? [] : [row.axis],
    linksToTheme: true,
    done: row.status === "done",
  }));
}

type Projection = ReturnType<typeof projectCompletion>;

function snapshotOf(
  projection: Projection,
  side: "before" | "after",
): MetricSnapshot {
  return {
    consistency: { ...projection.consistency[side] },
    axes: projection.axes.map((entry) => ({
      axis: entry.axis,
      name: AXIS_NAMES[entry.axis],
      count: entry[side].count,
      verdictLabel: entry[side].verdictLabel,
    })),
  };
}

/** 리포트 시점, 현재(완료 항목 반영), 전부 완료 시 세 시점의 지표. 스냅샷이 깨지면 null. */
export function planMetrics(
  report: PlanReportRow,
  rows: PlanItemRow[],
): PlanMetrics | null {
  const current = readProjectionCurrent(report);
  if (current === null) return null;

  // 추가분으로 넣기 위해 모두 미완(done false)으로 바꾼다.
  const asAdditions = (items: ProjectionItem[]) =>
    items.map((item) => ({ ...item, done: false }));
  const all = toProjectionItems(rows);
  const doneOnly = all.filter((item) => item.done === true);

  const base = projectCompletion({ current, items: [] });
  const now = projectCompletion({ current, items: asAdditions(doneOnly) });
  const afterAll = projectCompletion({ current, items: asAdditions(all) });

  return {
    atReport: snapshotOf(base, "before"),
    now: snapshotOf(now, "after"),
    afterAll: snapshotOf(afterAll, "after"),
    changedAxesNow: now.changedAxes,
    changedAxesAfterAll: afterAll.changedAxes,
  };
}
