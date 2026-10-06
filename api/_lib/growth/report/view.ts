// 저장된 성장설계 리포트의 조회 응답 조립. 순수 모듈이라 DB 와 시계에 닿지 않는다.
// api/growth/reports.ts 가 행을 읽어 이 모듈로 응답 본문을 만든다.

import { AXES, AXIS_NAMES, type AxisEvaluation, weakestAxis } from "../axes.js";
import {
  type OverviewInput,
  overviewCards,
  type SectionItem,
} from "../sections.js";
import { analysisRange, omittedSections } from "../tracks.js";
import type { SemesterKey, Track } from "../types.js";
import { parentView } from "./assemble.js";
import { nextStep, parseStepState, progress } from "./stepState.js";

export type StoredReportRow = {
  id: string;
  status: "draft" | "in_progress" | "completed" | "archived";
  current_step: number;
  track: string | null;
  narrative_theme: string | null;
  grade_subthemes: unknown;
  stage: string | null;
  axis_scores: unknown;
  consistency: unknown;
  sections: unknown;
  signals: unknown;
  issued_at: string | null;
  activity_ids: string[] | null;
  step_state: unknown;
  last_activity_at: string;
  created_at: string;
};

/** 목록과 미완 요약에 필요한 컬럼만. 큰 jsonb 는 읽지 않는다. */
export type StoredListRow = Pick<
  StoredReportRow,
  | "id"
  | "status"
  | "current_step"
  | "track"
  | "narrative_theme"
  | "issued_at"
  | "step_state"
  | "last_activity_at"
>;

export type StoredPlanItemRow = {
  id: string;
  program: "school" | "self" | "deep";
  title: string;
  description: string | null;
  priority: "required" | "recommended";
  axis: string | null;
  category: string | null;
  period: "course_selection" | "semester" | "vacation";
  period_label: string | null;
  deadline: string | null;
  status: "pending" | "done";
  done_source_program: string | null;
  done_at: string | null;
  carried_from_report_id: string | null;
  sort_order: number;
};

export type PlanCounts = { total: number; done: number };

export function planCounts(items: { status: string }[]): PlanCounts {
  return {
    total: items.length,
    done: items.filter((i) => i.status === "done").length,
  };
}

export function listItem(row: StoredListRow, counts: PlanCounts | null) {
  return {
    id: row.id,
    status: row.status,
    track: row.track,
    issuedAt: row.issued_at,
    theme: row.narrative_theme,
    lastActivityAt: row.last_activity_at,
    plan: counts,
  };
}

/** 미완 회차 요약. 생성 화면 재진입에 쓴다. */
export function openSummary(row: StoredListRow) {
  const state = parseStepState(row.step_state);
  return {
    id: row.id,
    status: row.status,
    currentStep: row.current_step,
    track: row.track,
    progress: progress(state),
    nextStep: nextStep(state),
    terminal: state.terminal ?? null,
    lastActivityAt: row.last_activity_at,
  };
}

/** 종결 사유를 가진 archived 중 가장 최근 1건. 90일 만료 archived 와 구분한다. */
export function lastTerminalOf(rows: StoredListRow[]): {
  reportId: string;
  reason: string;
  at: string;
  step: number;
} | null {
  let best: {
    reportId: string;
    reason: string;
    at: string;
    step: number;
  } | null = null;
  for (const r of rows) {
    if (r.status !== "archived") continue;
    const t = parseStepState(r.step_state).terminal;
    if (!t) continue;
    if (best === null || Date.parse(t.at) > Date.parse(best.at))
      best = { reportId: r.id, reason: t.reason, at: t.at, step: t.step };
  }
  return best;
}

// ---------------------------------------------------------------------------
// 한눈에 카드 입력(저장된 값만 사용). 모양이 다르면 null 로 두고 지어내지 않는다.
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAxisEvaluation(v: unknown): v is AxisEvaluation {
  return (
    isObject(v) &&
    typeof v.axis === "string" &&
    (AXES as readonly string[]).includes(v.axis) &&
    typeof v.verdict === "string" &&
    typeof v.count === "number" &&
    typeof v.required === "number" &&
    v.required > 0
  );
}

function asAxes(v: unknown): AxisEvaluation[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.every(isAxisEvaluation) ? (v as AxisEvaluation[]) : null;
}

function textOrNumber(v: unknown): string | null {
  if (typeof v === "string") return v;
  return typeof v === "number" && Number.isFinite(v) ? String(v) : null;
}

function section12Body(sections: unknown): Record<string, unknown> | null {
  if (!Array.isArray(sections)) return null;
  const found = sections.find((s) => isObject(s) && s.id === "1-12");
  return isObject(found) && isObject(found.body) ? found.body : null;
}

function brokenSemesterOf(
  track: Track | null,
  activities: { gradeLabel: string | null; semester: number | null }[],
): string | null {
  if (track === null) return null;
  const used = new Set(
    activities.map((a) => `${a.gradeLabel ?? ""}-${a.semester ?? ""}`),
  );
  const first = analysisRange(track).semesters.find(
    (key: SemesterKey) => !used.has(key),
  );
  return first ?? null;
}

export function overviewFromStored(input: {
  track: Track | null;
  consistency: unknown;
  axes: unknown;
  sections: unknown;
  activities: { gradeLabel: string | null; semester: number | null }[];
}): OverviewInput {
  const consistency = isObject(input.consistency) ? input.consistency : null;
  const percent = consistency?.percent;
  const axes = asAxes(input.axes);
  const weakest = axes ? weakestAxis(axes) : undefined;
  const body = section12Body(input.sections);
  return {
    consistencyPercent:
      typeof percent === "number" && Number.isFinite(percent) ? percent : null,
    consistencyLabel:
      typeof consistency?.verdictLabel === "string"
        ? consistency.verdictLabel
        : null,
    axesConfirmed: axes
      ? axes.filter((a) => a.verdict === "confirmed").length
      : null,
    axesTotal: axes ? AXES.length : null,
    weakestAxisText:
      weakest && weakest.verdict !== "confirmed"
        ? `${AXIS_NAMES[weakest.axis]} 보강이 가장 급해요`
        : null,
    estimate: textOrNumber(body?.estimate),
    actual: textOrNumber(body?.actual),
    curveLabel:
      typeof body?.verdictLabel === "string" ? body.verdictLabel : null,
    recommendedDone: null,
    recommendedTotal: null,
    brokenSemester: brokenSemesterOf(input.track, input.activities),
    activityCount: input.activities.length,
  };
}

// ---------------------------------------------------------------------------
// 상세 응답 본문
// ---------------------------------------------------------------------------

export type DetailActivity = {
  gradeLabel: string | null;
  semester: number | null;
};

/**
 * 완료 회차 상세 본문. parent 가 true 면 성적 민감 섹션을 빼고, 한눈에 카드도
 * 남은 섹션만으로 만들어 성적이 카드로 새지 않게 한다. 일관성과 5축은 그대로 둔다.
 */
export function detailBody(
  row: StoredReportRow,
  planItems: StoredPlanItemRow[],
  activities: DetailActivity[],
  options: { parent: boolean },
) {
  const all = Array.isArray(row.sections)
    ? (row.sections as SectionItem[])
    : [];
  const view = options.parent
    ? parentView(all)
    : { items: all, excludedIds: [] as string[] };
  const state = parseStepState(row.step_state);
  const track = row.track as Track | null;
  return {
    id: row.id,
    status: row.status,
    track: row.track,
    issuedAt: row.issued_at,
    currentStep: row.current_step,
    progress: progress(state),
    range:
      track === null
        ? null
        : (({ semesters, description }) => ({ semesters, description }))(
            analysisRange(track),
          ),
    omitted:
      track === null
        ? null
        : omittedSections(track, {
            noFirstYearData:
              track !== "고1" &&
              !activities.some((a) => a.gradeLabel === "고1"),
          }),
    narrative:
      row.narrative_theme === null
        ? null
        : {
            theme: row.narrative_theme,
            subthemes: row.grade_subthemes ?? null,
            stage: row.stage,
          },
    overview: overviewCards(
      overviewFromStored({
        track,
        consistency: row.consistency,
        axes: row.axis_scores,
        sections: view.items,
        activities,
      }),
    ),
    consistency: row.consistency ?? null,
    axes: row.axis_scores ?? null,
    sections: view.items,
    excludedSectionIds: view.excludedIds,
    planItems: [...planItems].sort((a, b) => a.sort_order - b.sort_order),
    lastActivityAt: row.last_activity_at,
  };
}

// ---------------------------------------------------------------------------
// 쿼리 검증
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReportsQuery =
  | {
      ok: true;
      reportId: string | undefined;
      /** 학부모가 연결 자녀를 지정할 때만 있다. */
      childId: string | undefined;
      view: "student" | "parent";
    }
  | { ok: false; reason: string };

export function parseReportsQuery(
  query: Record<string, unknown>,
): ReportsQuery {
  const raw = query.reportId;
  let reportId: string | undefined;
  if (raw !== undefined) {
    if (typeof raw !== "string" || !UUID_RE.test(raw)) {
      return { ok: false, reason: "reportId 형식이 올바르지 않아요." };
    }
    reportId = raw;
  }
  const rawChild = query.childId;
  let childId: string | undefined;
  if (rawChild !== undefined) {
    if (typeof rawChild !== "string" || !UUID_RE.test(rawChild)) {
      return { ok: false, reason: "childId 형식이 올바르지 않아요." };
    }
    childId = rawChild;
  }
  return {
    ok: true,
    reportId,
    childId,
    view: query.view === "parent" ? "parent" : "student",
  };
}
