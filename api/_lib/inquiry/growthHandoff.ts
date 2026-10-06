// 성장설계 수신 8종 조립(명세 No.107~109, 111, 178, 181, 개발계획 §1 과제 매칭, §2 23, §6 12, 13).
// DB 행은 인자로 받는다. axis_scores 는 성장설계 AxisEvaluation[](axis, verdict, optional)로 저장된다.
import { HANDOFF_STALE_MONTHS, STAGE_BY_GRADE } from "./constants.js";
import type { GradeLabel, GrowthHandoff, Stage } from "./types.js";

export type GrowthReportRow = {
  id: string;
  status: string;
  issued_at: string | null;
  narrative_theme: string | null;
  grade_subthemes: unknown;
  stage: string | null;
  axis_scores: unknown;
  signals: unknown;
};

export type PlanItemRow = {
  id: string;
  program: string;
  status: string;
  title: string;
  description: string | null;
  category: string | null;
  axis: string | null;
};

const GRADES: readonly GradeLabel[] = ["고1", "고2", "고3"];
const STAGES: readonly Stage[] = ["seed", "flower", "bloom"];
const AXIS_CODES = ["A", "B", "C", "D", "E"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** completed 이고 발행일이 있는 회차 중 가장 최근 1건(No.108). */
export function pickLatestCompleted(
  rows: GrowthReportRow[],
): GrowthReportRow | null {
  let best: GrowthReportRow | null = null;
  for (const row of rows) {
    if (row.status !== "completed" || !row.issued_at) continue;
    if (!best || Date.parse(row.issued_at) > Date.parse(best.issued_at ?? "")) {
      best = row;
    }
  }
  return best;
}

/** 발행 후 HANDOFF_STALE_MONTHS 개월을 넘겼는지. 말일 발행은 달 말일로 맞춘다. */
export function isStale(issuedAt: string, nowIso: string): boolean {
  const d = new Date(issuedAt);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + HANDOFF_STALE_MONTHS);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return Date.parse(nowIso) > d.getTime();
}

export function parseStage(raw: string | null): Stage | null {
  return STAGES.find((s) => s === raw) ?? null;
}

/** grade_subthemes 를 읽는다. 한 건이라도 모양이 다르면 빈 배열이다. */
export function parseSubthemes(raw: unknown): GrowthHandoff["subthemes"] {
  if (!Array.isArray(raw)) return [];
  const out: GrowthHandoff["subthemes"] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.text !== "string") return [];
    const grade = GRADES.find((g) => g === entry.grade);
    const stage = STAGES.find((s) => s === entry.stage);
    if (!grade || !stage) return [];
    out.push({ grade, stage, text: entry.text });
  }
  return out;
}

/**
 * 필요 건수에 못 미치는 축 코드(§6 12). 가정: axis_scores 는 AxisEvaluation[] 이고
 * verdict 가 none(아직 없음) 또는 caution(주의)이면 미달이다. optional 축은 제외한다.
 */
export function weakAxesFrom(axisScores: unknown): string[] {
  if (!Array.isArray(axisScores)) return [];
  const out: string[] = [];
  for (const entry of axisScores) {
    if (!isRecord(entry) || entry.optional === true) continue;
    const axis = typeof entry.axis === "string" ? entry.axis : "";
    if (!AXIS_CODES.includes(axis) || out.includes(axis)) continue;
    if (entry.verdict === "none" || entry.verdict === "caution") out.push(axis);
  }
  return out;
}

function squash(s: string | null): string {
  return (s ?? "").replace(/\s+/g, "");
}

/** deep, pending 항목이 후보. 과목명이 title 또는 category 에 든 항목이 정확히 1건이면 자동 선택(No.111). */
export function matchPlanItems(
  items: PlanItemRow[],
  subject: string,
): { candidates: PlanItemRow[]; autoSelected: PlanItemRow | null } {
  const candidates = items.filter(
    (i) => i.program === "deep" && i.status === "pending",
  );
  const key = squash(subject);
  if (key === "") return { candidates, autoSelected: null };
  const hits = candidates.filter(
    (i) => squash(i.title).includes(key) || squash(i.category).includes(key),
  );
  return {
    candidates,
    autoSelected: hits.length === 1 ? (hits[0] ?? null) : null,
  };
}

export function buildHandoff(input: {
  report: GrowthReportRow;
  planItems: PlanItemRow[];
  sessionGrade: GradeLabel;
  subject: string;
  nowIso: string;
}): GrowthHandoff & { autoSelectedPlanItemId: string | null } {
  const { report } = input;
  if (!report.issued_at) throw new Error("발행일 없는 회차는 수신할 수 없다");
  const stage = parseStage(report.stage);
  const { candidates, autoSelected } = matchPlanItems(
    input.planItems,
    input.subject,
  );
  return {
    reportId: report.id,
    issuedAt: report.issued_at,
    theme: report.narrative_theme,
    subthemes: parseSubthemes(report.grade_subthemes),
    stage,
    weakAxes: weakAxesFrom(report.axis_scores),
    signals: report.signals,
    planItems: candidates.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      category: i.category,
      axis: i.axis,
    })),
    stale: isStale(report.issued_at, input.nowIso),
    stageMismatch:
      stage !== null && stage !== STAGE_BY_GRADE[input.sessionGrade],
    autoSelectedPlanItemId: autoSelected?.id ?? null,
  };
}

/**
 * sessionStorage growth:handoff 값(성장설계 plan/types.ts ProgramHandoff)을 읽는다.
 * itemId 가 과제 id 다. ProgramHandoff 에는 과목이 없어 subject 는 문자열이 있을 때만 돌려준다.
 */
export function handoffPayload(
  input: unknown,
): { planItemId: string | null; subject: string | null } | null {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  if (typeof value.itemId !== "string" || value.itemId === "") return null;
  if (value.program !== undefined && value.program !== "deep") return null;
  return {
    planItemId: value.itemId,
    subject:
      typeof value.subject === "string" && value.subject !== ""
        ? value.subject
        : null,
  };
}
