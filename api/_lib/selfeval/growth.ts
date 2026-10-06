// 성장설계 수신분 정리(명세 No.68~74, 129, 130, §2 3, 26, 27, §6 20).
// growth_reports 행과 growth_plan_items 행을 세션에 고정할 스냅샷으로 줄이고,
// 활동 영역과 맞는 계획 항목, 방향 불일치 여부, 배너 요약을 결정론으로 만든다.

import { extractKeywords } from "./text.js";
import {
  AREA_LABELS,
  type Area,
  type Axis,
  GROWTH_STAGE_LABELS,
  type GrowthPlanItemRef,
  type GrowthSnapshot,
  type GrowthStage,
  type GrowthWeakAxis,
  type HighGrade,
} from "./types.js";

export type GrowthReportRowLike = {
  id: string;
  issued_at: string | null;
  narrative_theme: string | null;
  grade_subthemes: unknown;
  stage: unknown;
  axis_scores: unknown;
  signals: unknown;
};

export type PlanItemRowLike = {
  id: string;
  title: string;
  description: string | null;
  axis: string | null;
  category: string | null;
  program: string;
  status: string;
};

const STAGES: readonly GrowthStage[] = ["seed", "flower", "bloom"];
const GRADES: readonly HighGrade[] = ["고1", "고2", "고3"];
const AXES: readonly Axis[] = ["A", "B", "C", "D", "E"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asStage = (v: unknown): GrowthStage | null =>
  typeof v === "string" && (STAGES as readonly string[]).includes(v)
    ? (v as GrowthStage)
    : null;

const asAxis = (v: unknown): Axis | null =>
  typeof v === "string" && (AXES as readonly string[]).includes(v)
    ? (v as Axis)
    : null;

/**
 * 과목명 비교용 정규형. 공백, 숫자, 로마 숫자를 뗀다. "영어Ⅰ" 과 "영어" 가 같아지게 하려는 것이다.
 */
export function normalizeSubject(name: string): string {
  return name.replace(/[\sⅠ-ↈ0-9]/g, "");
}

function parseSubthemes(v: unknown): GrowthSnapshot["gradeSubthemes"] {
  if (!Array.isArray(v)) return [];
  const out: GrowthSnapshot["gradeSubthemes"] = [];
  for (const x of v) {
    if (!isRecord(x)) continue;
    const stage = asStage(x.stage);
    if (
      typeof x.grade !== "string" ||
      !(GRADES as readonly string[]).includes(x.grade) ||
      stage === null ||
      typeof x.text !== "string"
    )
      continue;
    out.push({ grade: x.grade as HighGrade, stage, text: x.text });
  }
  return out;
}

function parseWeakAxes(v: unknown): GrowthWeakAxis[] {
  if (!Array.isArray(v)) return [];
  const out: GrowthWeakAxis[] = [];
  for (const x of v) {
    if (!isRecord(x)) continue;
    const axis = asAxis(x.axis);
    if (
      axis === null ||
      typeof x.count !== "number" ||
      typeof x.required !== "number" ||
      x.count >= x.required
    )
      continue;
    out.push({
      axis,
      name: typeof x.name === "string" ? x.name : "",
      count: x.count,
      required: x.required,
      guideline: typeof x.guideline === "string" ? x.guideline : "",
    });
  }
  return out;
}

function parseSignalTexts(signals: unknown, key: "aligned" | "conflicting") {
  if (!isRecord(signals) || !isRecord(signals.match)) return [];
  const list = signals.match[key];
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) =>
    isRecord(x) && typeof x.text === "string" && x.text !== "" ? [x.text] : [],
  );
}

export function extractGrowthSnapshot(
  report: GrowthReportRowLike,
  planItems: PlanItemRowLike[],
): GrowthSnapshot | null {
  // 발행 전 리포트는 학생에게 보이지 않으므로 연동 대상이 아니다.
  if (report.issued_at == null) return null;
  return {
    reportId: report.id,
    issuedAt: report.issued_at,
    narrativeTheme: report.narrative_theme,
    gradeSubthemes: parseSubthemes(report.grade_subthemes),
    stage: asStage(report.stage),
    weakAxes: parseWeakAxes(report.axis_scores),
    alignedSignals: parseSignalTexts(report.signals, "aligned"),
    conflictingSignals: parseSignalTexts(report.signals, "conflicting"),
    planItems: planItems
      .filter((p) => p.program === "self" && p.status === "pending")
      .map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        axis: asAxis(p.axis),
        category: p.category,
      })),
  };
}

export function stageLabel(stage: GrowthStage | null): string | null {
  return stage === null ? null : GROWTH_STAGE_LABELS[stage];
}

type MatchCtx = {
  area: Area;
  subject: string | null;
  activityName: string | null;
};

export function matchPlanItems(
  snapshot: GrowthSnapshot,
  ctx: MatchCtx,
): GrowthPlanItemRef[] {
  const subject = ctx.subject ? normalizeSubject(ctx.subject) : "";
  const label = AREA_LABELS[ctx.area];
  const weak = new Set(snapshot.weakAxes.map((w) => w.axis));
  return snapshot.planItems.filter((p) => {
    if (p.axis !== null && weak.has(p.axis)) return true;
    if (p.category == null) return false;
    const cat = normalizeSubject(p.category);
    if (cat === "") return false;
    if (cat === label) return true;
    return subject !== "" && (cat === subject || cat.includes(subject));
  });
}

export type PlanPick =
  | { mode: "auto"; item: GrowthPlanItemRef }
  | { mode: "choose"; items: GrowthPlanItemRef[] }
  | { mode: "none" };

export function pickPlanItem(candidates: GrowthPlanItemRef[]): PlanPick {
  const [first] = candidates;
  if (first === undefined) return { mode: "none" };
  if (candidates.length === 1) return { mode: "auto", item: first };
  return { mode: "choose", items: candidates };
}

/** 성장설계 방향 문장에 이 과목이 전혀 안 나오고 연결된 계획 항목도 없으면 불일치(§2 27). */
export function directionMismatch(
  snapshot: GrowthSnapshot,
  ctx: MatchCtx,
  planCandidates: GrowthPlanItemRef[],
): boolean {
  if (planCandidates.length > 0) return false;
  const keys = extractKeywords(ctx.subject ?? AREA_LABELS[ctx.area]);
  // 비교할 낱말이 없으면 불일치라고 단정하지 않는다.
  if (keys.length === 0) return false;
  const direction = [
    snapshot.narrativeTheme ?? "",
    ...snapshot.gradeSubthemes.map((s) => s.text),
  ].join(" ");
  return !keys.some((k) => direction.includes(k));
}

export function bannerSummary(
  snapshot: GrowthSnapshot,
  currentGrade?: HighGrade,
): {
  theme: string | null;
  stageLabel: string | null;
  currentSubtheme: string | null;
  weakAxisNames: string[];
  issuedAt: string;
} {
  // 성장설계는 stage 를 현재 학년 부제의 stage 로 저장한다. 학년을 알면 그 부제, 모르면 stage 가
  // 같은 첫 부제, 그것도 없으면 가장 높은 학년 부제로 본다.
  const subs = snapshot.gradeSubthemes;
  const current =
    (currentGrade ? subs.find((s) => s.grade === currentGrade) : undefined) ??
    (snapshot.stage
      ? subs.find((s) => s.stage === snapshot.stage)
      : undefined) ??
    [...subs]
      .sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade))
      .at(-1);
  return {
    theme: snapshot.narrativeTheme,
    stageLabel: stageLabel(snapshot.stage),
    currentSubtheme: current?.text ?? null,
    weakAxisNames: snapshot.weakAxes.map((w) => w.name),
    issuedAt: snapshot.issuedAt,
  };
}
