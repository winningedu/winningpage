// 심화탐구 세션 규칙(명세 No.21~26, 53, 22, 개발계획 §2 3, 4, 10, 11, §6 11). 순수 함수만 둔다.
import {
  MAX_EVALUATIONS,
  MAX_MODEL_ATTEMPTS_PER_MODE,
  SESSION_EXPIRY_DAYS,
  TOPIC_MAX_ROUNDS,
} from "./constants.js";
import type { GenerationMode, ScreenStep, SessionStatus } from "./types.js";

const DAY_MS = 86_400_000;

/** 마지막 활동 후 90일째 당일부터 만료(No.26, §6 11). */
export function isExpired(lastActivityAt: string, nowIso: string): boolean {
  return (
    Date.parse(nowIso) - Date.parse(lastActivityAt) >=
    SESSION_EXPIRY_DAYS * DAY_MS
  );
}

/** 이 시각 이하에 마지막 활동이 있는 열린 세션이 만료 대상이다. */
export function expiryCutoffIso(nowIso: string): string {
  return new Date(
    Date.parse(nowIso) - SESSION_EXPIRY_DAYS * DAY_MS,
  ).toISOString();
}

/** 열린 세션이 있으면 이어하기를 허용하고, 없을 때 잔여 0 이면 막는다(§2 4, No.20). null 은 무제한. */
export function canStartNewSession(input: {
  openSession: boolean;
  quotaRemaining: number | null;
}): { ok: true } | { ok: false; code: "QUOTA_EXHAUSTED" } {
  if (input.openSession) return { ok: true };
  if (input.quotaRemaining === 0) return { ok: false, code: "QUOTA_EXHAUSTED" };
  return { ok: true };
}

/** 추천 라운드는 최초 1 + 재추천 3(No.53). */
export function nextRound(
  topicRoundCount: number,
): { ok: true; round: number } | { ok: false; code: "ROUND_LIMIT" } {
  const round = topicRoundCount + 1;
  if (round > TOPIC_MAX_ROUNDS) return { ok: false, code: "ROUND_LIMIT" };
  return { ok: true, round };
}

/** 평가 성공은 최초 1 + 재평가 3(No.22). */
export function canEvaluate(
  evaluationCount: number,
): { ok: true } | { ok: false; code: "REEVALUATION_LIMIT" } {
  if (evaluationCount >= MAX_EVALUATIONS) {
    return { ok: false, code: "REEVALUATION_LIMIT" };
  }
  return { ok: true };
}

export type GateTarget = GenerationMode | "finalize" | "submission";

/** 동작이 일어나는 화면 단계(No.113~115). */
export function requiredStepFor(mode: GateTarget): ScreenStep {
  switch (mode) {
    case "topic_recommendation":
      return 2;
    case "design_report":
      return 3;
    case "submission":
      return 4;
    case "evaluation_report":
      return 5;
    case "finalize":
      return 6;
  }
}

export type GateFailure = "STEP_ORDER" | "SESSION_LOCKED" | "SESSION_NOT_OPEN";

/**
 * 선행 조건과 잠금 판정. 다른 주제로 바꾸려는 경우는 호출 계층이 판정한다.
 * design_report 는 주제가 이미 있는지만 본다(선택은 같은 호출에서 함께 온다).
 */
export function gateFor(
  session: {
    selectedTopicId: string | null;
    designReportId: string | null;
    latestEvaluationId: string | null;
    status: SessionStatus;
  },
  target: GateTarget | "assets",
): { ok: true } | { ok: false; code: GateFailure } {
  if (session.status !== "draft" && session.status !== "in_progress") {
    return { ok: false, code: "SESSION_NOT_OPEN" };
  }
  switch (target) {
    case "assets":
    case "topic_recommendation":
      return session.designReportId
        ? { ok: false, code: "SESSION_LOCKED" }
        : { ok: true };
    case "design_report":
      return session.selectedTopicId
        ? { ok: true }
        : { ok: false, code: "STEP_ORDER" };
    case "submission":
    case "evaluation_report":
      return session.designReportId
        ? { ok: true }
        : { ok: false, code: "STEP_ORDER" };
    case "finalize":
      return session.latestEvaluationId
        ? { ok: true }
        : { ok: false, code: "STEP_ORDER" };
  }
}

/** 이어하기 화면 결정. 설계가 있으면 작성 화면(4)이다. */
export function screenStepFor(session: {
  status: SessionStatus;
  selectedTopicId: string | null;
  designReportId: string | null;
  latestEvaluationId: string | null;
  hasSubmissionDraft: boolean;
  hasTopics: boolean;
}): ScreenStep {
  if (session.status === "completed") return 6;
  if (session.latestEvaluationId) return 5;
  if (session.hasSubmissionDraft || session.designReportId) return 4;
  if (session.hasTopics || session.selectedTopicId) return 2;
  return 1;
}

// ── 생성 상태(§2 11) ────────────────────────────────────────────────────────

export type ModeState = {
  status: "pending" | "running" | "ok" | "failed";
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  issues: unknown[];
};

export type GenerationState = {
  modes: Record<GenerationMode, ModeState>;
  terminal: { reason: string; at: string; mode: string } | null;
};

const MODES: readonly GenerationMode[] = [
  "topic_recommendation",
  "design_report",
  "evaluation_report",
];
const STATUSES: readonly ModeState["status"][] = [
  "pending",
  "running",
  "ok",
  "failed",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseMode(raw: unknown): ModeState {
  const rec = isRecord(raw) ? raw : {};
  const status = STATUSES.find((s) => s === rec.status) ?? "pending";
  const attempts =
    typeof rec.attempts === "number" &&
    Number.isInteger(rec.attempts) &&
    rec.attempts >= 0
      ? rec.attempts
      : 0;
  return {
    status,
    attempts,
    startedAt: typeof rec.startedAt === "string" ? rec.startedAt : null,
    finishedAt: typeof rec.finishedAt === "string" ? rec.finishedAt : null,
    issues: Array.isArray(rec.issues) ? rec.issues : [],
  };
}

/** inquiry_sessions.generation_state 를 안전하게 읽는다. 없는 mode 는 pending 0 이다. */
export function parseGenerationState(raw: unknown): GenerationState {
  const rec = isRecord(raw) ? raw : {};
  const modes = isRecord(rec.modes) ? rec.modes : {};
  const t = rec.terminal;
  const terminal =
    isRecord(t) &&
    typeof t.reason === "string" &&
    typeof t.at === "string" &&
    typeof t.mode === "string"
      ? { reason: t.reason, at: t.at, mode: t.mode }
      : null;
  return {
    modes: Object.fromEntries(
      MODES.map((m) => [m, parseMode(modes[m])]),
    ) as Record<GenerationMode, ModeState>,
    terminal,
  };
}

export type ClaimResult =
  | { kind: "claimed"; attempts: number }
  | { kind: "running" }
  | { kind: "locked" }
  | { kind: "exhausted"; attempts: number }
  | { kind: "invalid" };

/** fn_inquiry_claim_generation 의 반환 jsonb 를 해석한다. */
export function interpretClaim(raw: unknown): ClaimResult {
  if (!isRecord(raw)) return { kind: "invalid" };
  const attempts =
    typeof raw.attempts === "number" && Number.isFinite(raw.attempts)
      ? raw.attempts
      : null;
  switch (raw.kind) {
    case "running":
      return { kind: "running" };
    case "locked":
      return { kind: "locked" };
    case "claimed":
      return attempts === null
        ? { kind: "invalid" }
        : { kind: "claimed", attempts };
    case "exhausted":
      return attempts === null
        ? { kind: "invalid" }
        : { kind: "exhausted", attempts };
    default:
      return { kind: "invalid" };
  }
}

/** 복구 불가이거나 시도 상한에 닿으면 세션을 종결한다(§2 10). */
export function shouldTerminate(
  failure: "validation" | "upstream" | "timeout" | "fatal",
  attempts: number,
): boolean {
  return failure === "fatal" || attempts >= MAX_MODEL_ATTEMPTS_PER_MODE;
}
