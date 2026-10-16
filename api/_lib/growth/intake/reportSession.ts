// 성장설계 회차 세션 규칙(순수 함수). 미완 회차 재사용, 이어하기 단계, 단계 상태 병합.
import { isExpired } from "../session.js";

export type StepStatus = "pending" | "running" | "done" | "failed";

export type StepStateEntry = {
  status: StepStatus;
  attempts: number;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

/** 키는 "1"~"8". */
export type StepState = Record<string, StepStateEntry>;

/** growth_reports 행의 느슨한 구조적 타입. 날짜는 ISO 문자열. */
export type GrowthReportRow = {
  id: string;
  status: "draft" | "in_progress" | "completed" | "archived";
  current_step: number;
  track: string | null;
  step_state: unknown;
  survey_answers: unknown;
  activity_ids: string[];
  grade_inputs: unknown;
  ledger_id: string | null;
  ledger_reversed_at: string | null;
  model_attempt_count: number;
  last_activity_at: string;
  issued_at: string;
};

export type OpenReportDecision =
  | { kind: "reuse"; report: GrowthReportRow }
  | { kind: "expire_and_create"; expiredIds: string[] }
  | { kind: "create" };

/** 미완 회차 처리 결정(No.115, 138, 139). 90일 미만 미완이 있으면 최신을 재사용한다. */
export function decideOpenReport(
  rows: GrowthReportRow[],
  now: string,
): OpenReportDecision {
  const open = rows.filter(
    (r) => r.status === "draft" || r.status === "in_progress",
  );
  const alive = open.filter((r) => !isExpired(r.last_activity_at, now));
  if (alive.length > 0) {
    const latest = alive.reduce((a, b) =>
      Date.parse(b.last_activity_at) > Date.parse(a.last_activity_at) ? b : a,
    );
    return { kind: "reuse", report: latest };
  }
  if (open.length > 0) {
    return { kind: "expire_and_create", expiredIds: open.map((r) => r.id) };
  }
  return { kind: "create" };
}

export type ResumePhase =
  | "survey"
  | "collect"
  | "generating"
  | "report"
  | "plan";

const LAST_STEP = 8;

function asStepState(value: unknown): StepState {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as StepState)
    : {};
}

function doneCount(state: StepState): number {
  return Object.values(state).filter((e) => e?.status === "done").length;
}

function maxDoneStep(state: StepState): number {
  let max = 0;
  for (const [key, entry] of Object.entries(state)) {
    const n = Number(key);
    if (entry?.status === "done" && Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

/** 이어하기 위치 산출. 실행계획 존재 여부(plan 단계)는 호출자가 판단한다. */
export function deriveResumeStep(report: GrowthReportRow): {
  resumeStep: number;
  phase: ResumePhase;
} {
  if (report.status === "completed") {
    return { resumeStep: report.current_step, phase: "report" };
  }
  if (report.current_step === 0) {
    return { resumeStep: 0, phase: report.track ? "collect" : "survey" };
  }
  const next = maxDoneStep(asStepState(report.step_state)) + 1;
  return {
    resumeStep: Math.min(LAST_STEP, Math.max(next, report.current_step)),
    phase: "generating",
  };
}

/** 시안 미완 회차 카드 문구 재료. totalQuestions 는 호출자가 설문 정의에서 넘긴다. */
export function summarizeOpenReport(
  report: GrowthReportRow,
  answeredCount: number,
  totalQuestions: number,
): { startedAt: string; lastSavedAt: string; stepLabel: string } {
  const { phase } = deriveResumeStep(report);
  let stepLabel: string;
  if (phase === "survey") {
    stepLabel = `2단계 학생 조사 ${totalQuestions}문항 중 ${answeredCount}문항 답함`;
  } else if (phase === "collect") {
    stepLabel = "3단계 활동 선택";
  } else {
    stepLabel = `4단계 리포트 생성 ${doneCount(asStepState(report.step_state))}/${LAST_STEP}`;
  }
  return {
    startedAt: report.issued_at,
    lastSavedAt: report.last_activity_at,
    stepLabel,
  };
}

export type StepPatch = Partial<Omit<StepStateEntry, "attempts">> & {
  /** true 면 attempts 를 1 늘린다. */
  increment?: boolean;
};

/** 단계 상태 병합. 입력은 바꾸지 않는다. 신규 단계의 status 는 patch 가 정한다. */
export function markStepState(
  prev: unknown,
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
  patch: StepPatch & { status: StepStatus },
): StepState {
  const base = asStepState(prev);
  const key = String(step);
  const { increment, ...fields } = patch;
  const current = base[key];
  const attempts = (current?.attempts ?? 0) + (increment ? 1 : 0);
  return { ...base, [key]: { ...current, ...fields, attempts } };
}
