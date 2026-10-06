// 자기평가서 세션 규칙. 학년도, 만료, 단계 순서 가드, step_state 정규화와 선점 결과 해석.
// 정본 전이는 DB RPC 가 하고, 핸들러 응답 조립과 RPC 결과 해석에 같은 규칙을 쓴다.
// 성장설계 api/_lib/growth/report/stepState.ts 와 같은 방식이다.

import {
  GROWTH_STALE_DAYS,
  MAX_MODEL_ATTEMPTS_PER_STEP,
  MODEL_STEP_KEYS,
  type ModelStepKey,
  SESSION_EXPIRY_DAYS,
  type SessionStep,
  type StepIssue,
  type StepRecord,
  type StepState,
  type StepStatus,
} from "./types.js";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function kstDate(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** 한국 날짜 기준 일 번호. 시각이 아니라 달력 날짜로 센다. */
function kstDayNumber(d: Date): number {
  return Math.floor(kstDate(d).getTime() / DAY_MS);
}

/** 학년도는 한국 시간 3월 1일에 바뀐다(명세 No.20). 2월까지는 전년도. */
export function currentAcademicYear(now: Date): number {
  const k = kstDate(now);
  return k.getUTCMonth() >= 2 ? k.getUTCFullYear() : k.getUTCFullYear() - 1;
}

function daysSince(iso: string, now: Date): number {
  return kstDayNumber(now) - kstDayNumber(new Date(iso));
}

/** 마지막 활동 후 90일째 당일부터 만료(명세 No.18). 시각이 아니라 날짜로 센다. */
export function isSessionExpired(lastActivityAt: string, now: Date): boolean {
  return daysSince(lastActivityAt, now) >= SESSION_EXPIRY_DAYS;
}

/** 성장설계 발급 후 180일째 당일부터 오래된 것으로 본다(명세 No.65). */
export function isGrowthStale(issuedAt: string, now: Date): boolean {
  return daysSince(issuedAt, now) >= GROWTH_STALE_DAYS;
}

export type StepAction = "pick" | "analyze" | "write" | "verify" | "finalize";

/** 각 action 이 요구하는 최소 current_step. DB RPC fn_selfeval_claim_step 과 같은 기준이다.
 * 분석 수정, 재생성, 재검증은 단계가 더 나아간 뒤에도 하므로 정확히 같을 때가 아니라 이상으로 본다. */
export const STEP_REQUIREMENTS: Record<StepAction, SessionStep> = {
  pick: 1,
  analyze: 2,
  write: 3,
  verify: 4,
  finalize: 5,
};

export function guardStep(
  currentStep: SessionStep,
  action: StepAction,
): { ok: true } | { ok: false; code: "STEP_ORDER"; requiredStep: SessionStep } {
  const required = STEP_REQUIREMENTS[action];
  if (currentStep >= required) {
    return { ok: true };
  }
  return { ok: false, code: "STEP_ORDER", requiredStep: required };
}

const STATUSES: readonly StepStatus[] = ["pending", "running", "ok", "failed"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function emptyStepRecord(): StepRecord {
  return {
    status: "pending",
    attempts: 0,
    startedAt: null,
    finishedAt: null,
    issues: [],
  };
}

function parseRecord(raw: unknown): StepRecord {
  const base = emptyStepRecord();
  if (!isObject(raw)) return base;
  return {
    status: STATUSES.includes(raw.status as StepStatus)
      ? (raw.status as StepStatus)
      : base.status,
    attempts:
      typeof raw.attempts === "number" &&
      Number.isFinite(raw.attempts) &&
      raw.attempts >= 0
        ? raw.attempts
        : 0,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
    finishedAt: typeof raw.finishedAt === "string" ? raw.finishedAt : null,
    issues: Array.isArray(raw.issues) ? (raw.issues as StepIssue[]) : [],
  };
}

function isModelStepKey(v: unknown): v is ModelStepKey {
  return (MODEL_STEP_KEYS as readonly unknown[]).includes(v);
}

export function parseStepState(raw: unknown): StepState {
  if (!isObject(raw)) return { steps: {} };
  const state: StepState = { steps: {} };
  if (isObject(raw.steps)) {
    for (const [key, value] of Object.entries(raw.steps)) {
      if (isModelStepKey(key)) state.steps[key] = parseRecord(value);
    }
  }
  const t = raw.terminal;
  if (
    isObject(t) &&
    typeof t.reason === "string" &&
    typeof t.at === "string" &&
    (t.step === null || isModelStepKey(t.step))
  ) {
    state.terminal = { reason: t.reason, at: t.at, step: t.step };
  }
  return state;
}

export function stepRecord(state: StepState, key: ModelStepKey): StepRecord {
  return state.steps[key] ?? emptyStepRecord();
}

export function isExhausted(record: StepRecord): boolean {
  return record.attempts >= MAX_MODEL_ATTEMPTS_PER_STEP;
}

const STEP_LABELS: Record<ModelStepKey, string> = {
  analyze: "분석",
  write: "생성",
  verify: "검증",
};

export function progress(state: StepState): {
  step: ModelStepKey;
  label: string;
  status: StepStatus;
  attempts: number;
}[] {
  return MODEL_STEP_KEYS.map((step) => {
    const r = stepRecord(state, step);
    return {
      step,
      label: STEP_LABELS[step],
      status: r.status,
      attempts: r.attempts,
    };
  });
}

export type ClaimResult =
  | { kind: "claimed"; attempts: number }
  | { kind: "locked" }
  | { kind: "order"; currentStep: number }
  | { kind: "running" }
  | { kind: "exhausted"; attempts: number };

/** 선점 RPC 가 돌려준 jsonb 를 ClaimResult 로 정규화한다. 모르는 모양이면 던진다. */
export function interpretClaim(raw: unknown): ClaimResult {
  const fail = (): never => {
    throw new Error(`선점 결과를 해석할 수 없습니다: ${JSON.stringify(raw)}`);
  };
  if (!isObject(raw)) return fail();
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fail();
  switch (raw.kind) {
    case "claimed":
      return { kind: "claimed", attempts: num(raw.attempts) };
    case "exhausted":
      return { kind: "exhausted", attempts: num(raw.attempts) };
    case "order":
      return { kind: "order", currentStep: num(raw.currentStep) };
    case "locked":
    case "running":
      return { kind: raw.kind };
    default:
      return fail();
  }
}

export type SessionRoute =
  | "new"
  | "activities"
  | "analysis"
  | "result"
  | "verify"
  | "done";

/** current_step 에서 이어 쓸 화면. 0 은 아직 입력 전이라 새로 시작한다. */
export function routeForStep(step: SessionStep): SessionRoute {
  switch (step) {
    case 0:
      return "new";
    case 1:
      return "activities";
    case 2:
    case 3:
      return "analysis";
    case 4:
      return "result";
    case 5:
      return "verify";
    case 6:
      return "done";
  }
}
