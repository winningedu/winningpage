// growth_reports.step_state jsonb 의 읽기, 정규화, 전이, 진행 표시. 순수 모듈.
// 정본 전이는 DB RPC 가 하고, 핸들러 응답 조립과 RPC 결과 해석에 같은 규칙을 쓴다.

import { canRetry, type ValidationIssue } from "../validation.js";
import {
  type ClaimResult,
  type PlanItemDraft,
  STEP_LABELS,
  STEP_NUMBERS,
  type StepNumber,
  type StepRecord,
  type StepState,
  type StepStatus,
} from "./types.js";

const STATUSES: readonly StepStatus[] = ["pending", "running", "ok", "failed"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStepNumber(v: unknown): v is StepNumber {
  return (
    typeof v === "number" && (STEP_NUMBERS as readonly number[]).includes(v)
  );
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
    issues: Array.isArray(raw.issues) ? (raw.issues as ValidationIssue[]) : [],
  };
}

export function parseStepState(raw: unknown): StepState {
  if (!isObject(raw)) return { steps: {} };
  const state: StepState = { steps: {} };
  if (isObject(raw.steps)) {
    for (const [key, value] of Object.entries(raw.steps)) {
      const n = Number(key);
      if (String(n) === key && isStepNumber(n))
        state.steps[n] = parseRecord(value);
    }
  }
  if (Array.isArray(raw.planDraft))
    state.planDraft = raw.planDraft as PlanItemDraft[];
  const t = raw.terminal;
  if (
    isObject(t) &&
    typeof t.reason === "string" &&
    typeof t.at === "string" &&
    isStepNumber(t.step)
  ) {
    state.terminal = { reason: t.reason, at: t.at, step: t.step };
  }
  return state;
}

export function stepRecord(state: StepState, step: StepNumber): StepRecord {
  return state.steps[step] ?? emptyStepRecord();
}

export function nextStep(state: StepState): StepNumber | null {
  for (const n of STEP_NUMBERS) {
    if (stepRecord(state, n).status !== "ok") return n;
  }
  return null;
}

export function isExhausted(record: StepRecord): boolean {
  return !canRetry(record.attempts);
}

export function progress(
  state: StepState,
): { step: StepNumber; label: string; status: StepStatus; attempts: number }[] {
  return STEP_NUMBERS.map((step) => {
    const r = stepRecord(state, step);
    return {
      step,
      label: STEP_LABELS[step],
      status: r.status,
      attempts: r.attempts,
    };
  });
}

/** 선점 RPC 가 돌려준 jsonb 를 ClaimResult 로 정규화한다. */
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
    case "done":
    case "locked":
    case "running":
      return { kind: raw.kind };
    default:
      return fail();
  }
}

/** 운영 기록용 종결 사유. 사용자 안내 문구가 아니다. */
export function terminalReasonFor(
  kind: "exhausted" | "fatal",
  step: StepNumber,
): string {
  return kind === "exhausted"
    ? `${step}단계 시도 상한 초과`
    : `${step}단계 복구 불가 오류`;
}
