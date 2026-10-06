// 성장설계 "완료하면 달라지는 것" 패널 예측(No.103). 순수 함수.
// 미완 실행계획 항목을 전부 완료했다고 가정해 일관성과 5축 판정의 전후를 비교한다.

import { AXES, AXIS_NAMES, projectAxes } from "./axes.js";
import { projectConsistency, VERDICT_LABEL } from "./consistency.js";
import type { Axis, HighGrade } from "./types.js";

export type ProjectionItem = {
  id: string;
  axis?: Axis | null;
  linksToTheme?: boolean;
  done?: boolean;
};

export type ProjectionInput = {
  current: {
    consistency: { linked: number; total: number };
    axisCounts: Record<Axis, number>;
    grade: HighGrade;
  };
  items: ProjectionItem[];
};

export type ConsistencySnapshot = {
  percent: number | null;
  verdictLabel: string | null;
};

export type AxisSnapshot = { count: number; verdictLabel: string };

export type CompletionProjection = {
  consistency: { before: ConsistencySnapshot; after: ConsistencySnapshot };
  axes: {
    axis: Axis;
    name: string;
    before: AxisSnapshot;
    after: AxisSnapshot;
  }[];
  changedAxes: Axis[];
};

function snapshotConsistency(
  current: { linked: number; total: number },
  additionalLinked: number,
): ConsistencySnapshot {
  const projected = projectConsistency(current, additionalLinked);
  if (projected === null || projected.verdict === null) {
    return { percent: projected?.percent ?? null, verdictLabel: null };
  }
  return {
    percent: projected.percent,
    verdictLabel: VERDICT_LABEL[projected.verdict],
  };
}

/** 미완 항목을 모두 완료했다고 가정한 전후 비교. */
export function projectCompletion(
  input: ProjectionInput,
): CompletionProjection {
  const pending = input.items.filter((item) => item.done !== true);
  const additionalLinked = pending.filter(
    (item) => item.linksToTheme === true,
  ).length;
  const additions = pending.flatMap((item) =>
    item.axis ? [{ axis: item.axis }] : [],
  );

  const { current } = input;
  const before = projectAxes(current.axisCounts, [], current.grade);
  const after = projectAxes(current.axisCounts, additions, current.grade);

  const axes = AXES.map((axis) => {
    const b = before.find((e) => e.axis === axis);
    const a = after.find((e) => e.axis === axis);
    if (!b || !a) throw new Error(`축 평가 누락: ${axis}`);
    return {
      axis,
      name: AXIS_NAMES[axis],
      before: { count: b.count, verdictLabel: b.verdictLabel },
      after: { count: a.count, verdictLabel: a.verdictLabel },
    };
  });

  return {
    consistency: {
      before: snapshotConsistency(current.consistency, 0),
      after: snapshotConsistency(current.consistency, additionalLinked),
    },
    axes,
    changedAxes: axes
      .filter((e) => e.before.verdictLabel !== e.after.verdictLabel)
      .map((e) => e.axis),
  };
}
