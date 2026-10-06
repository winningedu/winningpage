// 성장설계 실행계획 조회 응답 조립(P5, No.155~164). 순수 모듈이라 DB 와 시계에 닿지 않고,
// 오늘 날짜는 todayIso 인자로 받는다.

import { deadlineState, orderPlanPeriods, type PlanPeriod } from "../tracks.js";
import type { HighGrade, Track } from "../types.js";
import type {
  PlanGroup,
  PlanItemRow,
  PlanItemView,
  PlanReportRow,
  ProgramHandoff,
} from "./types.js";

export const PERIOD_LABELS: Record<PlanPeriod, string> = {
  course_selection: "과목 선택 시기",
  semester: "남은 학기",
  vacation: "방학",
};

const AVOID_REPEAT_SECTION_ID = "3-13";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 졸업과 N수는 마지막 학년인 고3 으로 본다. */
export function currentGradeOf(track: Track | null): HighGrade | null {
  if (track === null) return null;
  if (track === "고1" || track === "고2" || track === "고3") return track;
  return "고3";
}

export function toItemView(row: PlanItemRow, todayIso: string): PlanItemView {
  const state = deadlineState(row.deadline, todayIso);
  return {
    id: row.id,
    program: row.program,
    title: row.title,
    description: row.description,
    priority: row.priority,
    axis: row.axis,
    category: row.category,
    period: row.period,
    periodLabel: row.period_label,
    deadline: row.deadline,
    dday: state.dday,
    urgent: state.urgent,
    deadlineLabel: state.label,
    done: row.status === "done",
    doneSource: row.done_source_program,
    doneAt: row.done_at,
    carried: row.carried_from_report_id !== null,
    carriedFromReportId: row.carried_from_report_id,
    sortOrder: row.sort_order,
  };
}

/** 시기 묶음. 시기 순서는 orderPlanPeriods, 묶음 안은 sort_order 오름차순. 항목이 있는 시기만. */
export function groupItems(rows: PlanItemRow[], todayIso: string): PlanGroup[] {
  const groups: PlanGroup[] = [];
  for (const row of orderPlanPeriods(
    rows.map((r) => ({ ...r, deadline: r.deadline })),
  )) {
    let group = groups.find((g) => g.period === row.period);
    if (!group) {
      group = {
        period: row.period,
        label: PERIOD_LABELS[row.period],
        items: [],
      };
      groups.push(group);
    }
    group.items.push(toItemView(row, todayIso));
  }
  for (const g of groups) g.items.sort((a, b) => a.sortOrder - b.sortOrder);
  return groups;
}

export function progress(rows: PlanItemRow[]): {
  total: number;
  done: number;
  remaining: number;
  percent: number;
} {
  const total = rows.length;
  const done = rows.filter((r) => r.status === "done").length;
  return {
    total,
    done,
    remaining: total - done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export type NextDeadline = {
  itemId: string;
  deadline: string;
  dday: number;
  urgent: boolean;
};

/** 미완료 항목 중 마감이 가장 이른 것. 지난 마감도 후보다. */
export function nextDeadline(
  rows: PlanItemRow[],
  todayIso: string,
): NextDeadline | null {
  let best: PlanItemRow | null = null;
  for (const r of rows) {
    if (r.status !== "pending" || !r.deadline) continue;
    if (best === null || (best.deadline ?? "") > r.deadline) best = r;
  }
  if (best === null || best.deadline === null) return null;
  const state = deadlineState(best.deadline, todayIso);
  if (state.dday === null) return null;
  return {
    itemId: best.id,
    deadline: best.deadline,
    dday: state.dday,
    urgent: state.urgent,
  };
}

export function carriedItems(
  rows: PlanItemRow[],
  todayIso: string,
): PlanItemView[] {
  return rows
    .filter((r) => r.carried_from_report_id !== null)
    .map((r) => toItemView(r, todayIso));
}

/** 섹션 3-13 의 피해야 할 반복(No.159). 모양이 다르면 빈 배열. */
export function avoidRepeats(
  sections: unknown,
): { text: string; evidenceIds: string[] }[] {
  if (!Array.isArray(sections)) return [];
  const section = sections.find(
    (s): s is Record<string, unknown> =>
      isRecord(s) && s.id === AVOID_REPEAT_SECTION_ID,
  );
  if (!section || !isRecord(section.body)) return [];
  const items = section.body.items;
  if (!Array.isArray(items)) return [];
  const out: { text: string; evidenceIds: string[] }[] = [];
  for (const it of items) {
    if (typeof it === "string") {
      out.push({ text: it, evidenceIds: [] });
    } else if (isRecord(it) && typeof it.text === "string") {
      const ids = Array.isArray(it.evidence_ids)
        ? it.evidence_ids.filter((e): e is string => typeof e === "string")
        : [];
      out.push({ text: it.text, evidenceIds: ids });
    }
  }
  return out;
}

export function subthemeFor(
  report: PlanReportRow,
  grade: HighGrade | null,
): string | null {
  if (grade === null || !Array.isArray(report.grade_subthemes)) return null;
  for (const s of report.grade_subthemes) {
    if (isRecord(s) && s.grade === grade && typeof s.text === "string") {
      return s.text;
    }
  }
  return null;
}

/** 하위 프로그램 최소 전달값(No.160). self, deep 에만 붙이는 것은 호출자 몫이다. */
export function handoffFor(
  report: PlanReportRow,
  item: PlanItemRow,
): ProgramHandoff {
  const currentGrade = currentGradeOf(report.track);
  return {
    reportId: report.id,
    itemId: item.id,
    program: item.program,
    theme: report.narrative_theme,
    currentGrade,
    stage: report.stage,
    subtheme: subthemeFor(report, currentGrade),
    condition: {
      title: item.title,
      description: item.description,
      axis: item.axis,
      category: item.category,
    },
  };
}

export function buildPlanBody(
  report: PlanReportRow,
  rows: PlanItemRow[],
  todayIso: string,
  metrics: unknown,
) {
  const currentGrade = currentGradeOf(report.track);
  const handoffs: Record<string, ProgramHandoff> = {};
  for (const r of rows) {
    if (r.program === "self" || r.program === "deep") {
      handoffs[r.id] = handoffFor(report, r);
    }
  }
  return {
    reportId: report.id,
    issuedAt: report.issued_at,
    track: report.track,
    theme: report.narrative_theme,
    stage: report.stage,
    currentGrade,
    subtheme: subthemeFor(report, currentGrade),
    groups: groupItems(rows, todayIso),
    progress: progress(rows),
    nextDeadline: nextDeadline(rows, todayIso),
    carried: carriedItems(rows, todayIso),
    avoidRepeats: avoidRepeats(report.sections),
    metrics,
    handoffs,
  };
}
