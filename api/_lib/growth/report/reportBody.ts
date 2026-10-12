// api/growth/report 의 순수 보조: 바디 검증, 응답과 오류 조립, 종결 판정, 모델 어댑터.

import type { AiTrace } from "../../ai/telemetry/trace.js";
import type { ValidationIssue } from "../validation.js";
import type { CallInfo, PromptBundle } from "./prompts.js";
import type { RunStepDeps, StoredOutputs } from "./runStep.js";
import {
  isExhausted,
  nextStep,
  parseStepState,
  progress,
  stepRecord,
} from "./stepState.js";
import type { ClaimResult, StepNumber, StepState } from "./types.js";
import { STEP_NUMBERS } from "./types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReportBody = { reportId: string; step: StepNumber };

export function validateReportBody(
  raw: unknown,
): { ok: true; body: ReportBody } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { ok: false, reason: "요청 본문이 올바르지 않아요." };
  const { reportId, step } = raw as Record<string, unknown>;
  if (typeof reportId !== "string" || !UUID_RE.test(reportId))
    return { ok: false, reason: "reportId 오류" };
  if (
    typeof step !== "number" ||
    !(STEP_NUMBERS as readonly number[]).includes(step)
  )
    return { ok: false, reason: "step 은 1~8 정수여야 해요." };
  return { ok: true, body: { reportId, step: step as StepNumber } };
}

export type StepResponseInput = {
  reportId: string;
  step: StepNumber;
  state: StepState;
  result: "ok" | "done" | "failed";
  issues?: ValidationIssue[];
  charged?: boolean;
  completion?: { issuedAt: string; planItemCount: number };
};

export function stepResponse(input: StepResponseInput) {
  const { state } = input;
  return {
    ok: true as const,
    reportId: input.reportId,
    step: input.step,
    result: input.result,
    attempts: stepRecord(state, input.step).attempts,
    nextStep: nextStep(state),
    progress: progress(state),
    ...(input.issues !== undefined && { issues: input.issues }),
    ...(input.charged !== undefined && { charged: input.charged }),
    ...(input.completion !== undefined && { completion: input.completion }),
  };
}

export type CodedError = { status: number; code: string; message: string };

export function claimErrorOf(
  claim: Exclude<ClaimResult, { kind: "claimed" } | { kind: "done" }>,
): CodedError {
  switch (claim.kind) {
    case "locked":
      return {
        status: 409,
        code: "REPORT_LOCKED",
        message: "이 회차는 더 이상 생성을 진행할 수 없어요.",
      };
    case "order":
      return {
        status: 409,
        code: "STEP_ORDER",
        message: `앞 단계가 아직 끝나지 않았어요. 현재 ${claim.currentStep}단계부터 진행해 주세요.`,
      };
    case "running":
      return {
        status: 409,
        code: "STEP_RUNNING",
        message: "같은 단계가 이미 진행 중이에요. 잠시 뒤 다시 확인해 주세요.",
      };
    case "exhausted":
      return {
        status: 409,
        code: "ATTEMPTS_EXHAUSTED",
        message: "이 단계의 시도 횟수를 모두 사용했어요.",
      };
  }
}

export type StepFailure = "validation" | "upstream" | "timeout" | "fatal";

const FAILURE_ERRORS: Record<StepFailure, CodedError> = {
  validation: {
    status: 422,
    code: "STEP_VALIDATION_FAILED",
    message: "분석 결과가 기준을 통과하지 못했어요. 다시 시도해 주세요.",
  },
  upstream: {
    status: 502,
    code: "MODEL_UPSTREAM_FAILED",
    message: "분석 서버 응답에 실패했어요. 잠시 뒤 다시 시도해 주세요.",
  },
  timeout: {
    status: 504,
    code: "STEP_TIMEOUT",
    message: "분석 시간이 초과됐어요. 다시 시도해 주세요.",
  },
  fatal: {
    status: 500,
    code: "STEP_FATAL",
    message: "리포트를 만드는 중 복구할 수 없는 오류가 났어요.",
  },
};

export function failureErrorOf(failure: StepFailure): CodedError {
  return FAILURE_ERRORS[failure];
}

/** 복구 불가(fatal)이거나 그 단계 시도가 상한에 닿았으면 회차를 종결한다. */
export function shouldTerminate(
  state: StepState,
  step: StepNumber,
  failure: StepFailure,
): boolean {
  return failure === "fatal" || isExhausted(stepRecord(state, step));
}

/** growth_reports 행 중 단계 산출 컬럼. */
export type StoredRow = {
  signals: unknown;
  narrative_theme: string | null;
  grade_subthemes: unknown;
  stage: string | null;
  consistency: unknown;
  axis_scores: unknown;
  sections: unknown;
  step_state: unknown;
};

export function toStoredOutputs(row: StoredRow): StoredOutputs {
  return {
    signals: row.signals,
    narrative_theme: row.narrative_theme,
    grade_subthemes: row.grade_subthemes,
    stage: row.stage,
    consistency: row.consistency,
    axis_scores: row.axis_scores,
    sections: row.sections,
    planDraft: parseStepState(row.step_state).planDraft,
  };
}

type CallStructured = (
  system: string,
  user: string,
  options: {
    responseMimeType: string;
    responseSchema: PromptBundle["responseSchema"];
    maxOutputTokens: number;
    temperature: number;
    abortSignal: AbortSignal;
    telemetry?: AiTrace;
  },
) => Promise<{ text: string; finishReason: string | null }>;

/** 성장설계 리포트 모델 온도. 실측에서 0.35 는 반복 루프가 22회 중 9회, 0.2 는 21회 중 4회였다. */
export const REPORT_MODEL_TEMPERATURE = 0.2;

/** 계기판 행의 call_key. 한 단계 안 동시 호출을 구분한다. */
function callKeyOf(info: CallInfo): string {
  switch (info.kind) {
    case "batch":
      return `batch:${info.batchIndex ?? 0}`;
    case "section":
      return `section:${info.sectionId ?? ""}`;
    default:
      return info.kind;
  }
}

/**
 * gemini callStructured 를 runStep 의 callModel 계약으로 맞추는 어댑터.
 * telemetry 가 있으면 호출마다 callInfo 로 자식 핸들을 만들어 넘긴다. 동시에 도는 호출의
 * 행과 검증 결과가 서로 섞이지 않게 annotate 도 그 자식에 묶어 돌려준다.
 */
export function callModelWith(
  callStructured: CallStructured,
  telemetry?: AiTrace,
): RunStepDeps["callModel"] {
  return async (bundle, signal, meta) => {
    const info = bundle.callInfo;
    const child = telemetry?.fork({
      step: String(info.step),
      callKey: callKeyOf(info),
      attempt: info.attempt + 1,
      retryReason: info.attempt === 1 ? (meta?.retryReason ?? null) : null,
    });
    const reply = await callStructured(bundle.system, bundle.user, {
      responseMimeType: "application/json",
      responseSchema: bundle.responseSchema,
      maxOutputTokens: bundle.maxOutputTokens,
      temperature: REPORT_MODEL_TEMPERATURE,
      abortSignal: signal,
      ...(child !== undefined && { telemetry: child }),
    });
    if (child === undefined) return reply;
    return {
      ...reply,
      annotate: (a) => {
        // 기록은 부가 기능이라 표시 실패가 생성 결과를 바꾸지 않게 삼킨다.
        try {
          child.annotateLastCall(a);
        } catch (e) {
          console.warn("[ai-telemetry] 검증 결과 표시 실패:", e);
        }
      },
    };
  };
}

/** 차감 판단에 쓰는 행 필드. */
export type ChargeRow = {
  ledger_id: string | null;
  ledger_reversed_at: string | null;
  status: "draft" | "in_progress" | "completed" | "archived";
};

/** 차감 이력이 있고 되돌리지 않은 회차. */
export function isCharged(row: ChargeRow): boolean {
  return row.ledger_id !== null && row.ledger_reversed_at === null;
}

/** 종결 시 차감을 되돌려야 하는 회차. */
export function needsReverse(row: ChargeRow): boolean {
  return isCharged(row);
}

export type ChargeGate =
  | "check_access"
  | "late_charge"
  | "refuse_closed"
  | "none";

/** 선점 전 차감 판단. 1단계는 이용권 확인, 2단계 이상 미차감은 열린 회차만 늦은 차감. */
export function chargeGate(row: ChargeRow, step: StepNumber): ChargeGate {
  if (isCharged(row)) return "none";
  if (step === 1) return "check_access";
  return row.status === "draft" || row.status === "in_progress"
    ? "late_charge"
    : "refuse_closed";
}

export type TerminateOutcome = {
  ok: boolean;
  reason: string;
  needsReverse: boolean;
};

/** fn_growth_terminate_report 반환 jsonb 를 정규화한다. 성공이면 needsReverse 가 반드시 불리언이어야 한다. */
export function interpretTerminate(raw: unknown): TerminateOutcome {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new Error(`종결 결과를 해석할 수 없습니다: ${JSON.stringify(raw)}`);
  const r = raw as Record<string, unknown>;
  if (r.ok === true) {
    if (typeof r.needsReverse !== "boolean")
      throw new Error(`종결 결과를 해석할 수 없습니다: ${JSON.stringify(raw)}`);
    return { ok: true, reason: "terminated", needsReverse: r.needsReverse };
  }
  return {
    ok: false,
    reason: typeof r.reason === "string" ? r.reason : "unknown",
    needsReverse: false,
  };
}
