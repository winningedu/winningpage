// 심화탐구 생성 공통 러너(개발계획 부록 B, B-1). HTTP 를 모른다.
// 선점, 모델 호출, 검증, 요청 안 재요청 1회, 저장, 종료, 종결과 되돌림까지 맡고
// 결과는 GenerationOutcome 으로 돌려준다. 응답 매핑은 generationErrorOf 와 호출 핸들러가 한다.
// mode 별 규칙(프롬프트 조립, 검증, 저장)은 spec 으로 주입받는다.

import { createAiTrace } from "../aiTelemetry/trace.js";
import type { callStructured } from "../gemini.js";
import {
  DeadlineExceeded,
  withinBudget,
} from "../growth/intake/extractRunner.js";
import { type Db, loadSession } from "./db.js";
import {
  claimGeneration,
  finishGeneration,
  reverseCredit,
  terminateSession,
} from "./generateDb.js";
import type { PromptBundle } from "./prompts.js";
import {
  type GateFailure,
  type GenerationState,
  parseGenerationState,
  shouldTerminate,
} from "./session.js";
import type { GenerationMode, ValidationIssue } from "./types.js";
import {
  buildRetryNote,
  parseJsonResponse,
  TRUNCATED_RETRY_NOTE,
} from "./validation.js";

export type { PromptBundle };

/** 요청 하나의 모델 호출 총 예산(부록 B). maxDuration 60초 안에서 저장과 응답 여유를 남긴다. */
export const GENERATION_BUDGET_MS = 50_000;

export type GenerationDeps = {
  callStructured: typeof callStructured;
  now: () => string;
  /** 이 요청이 시작된 시각(Date.now). 예산 계산에 쓴다. */
  startedAt: number;
};

export type PrecheckResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      extra?: Record<string, unknown>;
    };

export type GenerationSpec<TParsed, TSaved> = {
  mode: GenerationMode;
  /** 선행 조건 검사(gateFor 와 mode 별 상한). 실패면 러너가 그 오류를 그대로 돌려준다. */
  precheck: () => PrecheckResult;
  prompt: PromptBundle;
  validate: (
    value: unknown,
  ) => { ok: true; value: TParsed } | { ok: false; issues: ValidationIssue[] };
  /** 재요청 프롬프트. truncated 면 TRUNCATED_RETRY_NOTE, 아니면 buildRetryNote(issues) 를 user 끝에 붙인다. */
  retryPrompt: (issues: ValidationIssue[], truncated: boolean) => PromptBundle;
  /** 검증 통과분 저장(service_role insert, 세션 포인터와 current_step 갱신). 실패는 fatal. */
  persist: (value: TParsed, attempts: number) => Promise<TSaved>;
};

export type GenerationOutcome<TSaved> =
  | {
      kind: "ok";
      saved: TSaved;
      attempts: number;
      generation: GenerationState;
    }
  | {
      kind: "precheck";
      status: number;
      code: string;
      message: string;
      extra?: Record<string, unknown>;
    }
  | {
      kind: "claim_error";
      code: "GENERATION_RUNNING" | "ATTEMPTS_EXHAUSTED" | "SESSION_NOT_OPEN";
      attempts: number | null;
      terminal: boolean;
      generation: GenerationState;
    }
  | {
      kind: "failure";
      failure: "validation" | "upstream" | "timeout" | "fatal";
      issues: ValidationIssue[];
      attempts: number;
      terminal: boolean;
      generation: GenerationState;
    };

async function readGeneration(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<GenerationState> {
  const row = await loadSession(db, userId, sessionId);
  return parseGenerationState(row?.generation_state);
}

/**
 * 세션을 archived 로 닫고 필요하면 차감을 되돌린다. 되돌릴지는 종결 RPC 가 잠금 안에서
 * 판단한 needsReverse 만 믿는다. 되돌림 실패는 응답을 막지 않는다.
 */
export async function terminateAndReverse(
  db: Db,
  userId: string,
  sessionId: string,
  mode: GenerationMode,
  kind: "exhausted" | "fatal",
): Promise<void> {
  const t = await terminateSession(db, sessionId, userId, mode, kind);
  if (!t.needsReverse) return;
  try {
    const r = await reverseCredit(db, sessionId, userId);
    if (!r.reversed) console.warn("inquiry 차감 되돌림 안 됨:", r.status);
  } catch (e) {
    console.error("inquiry 차감 되돌림 실패:", e);
  }
}

const GATE_MESSAGES: Record<GateFailure, string> = {
  STEP_ORDER: "앞 단계를 먼저 끝내 주세요.",
  SESSION_LOCKED: "설계 리포트가 만들어진 뒤에는 바꿀 수 없어요.",
  SESSION_NOT_OPEN: "이미 닫힌 세션이에요.",
};

/** session.ts gateFor 실패를 precheck 실패 모양(409)으로 바꾼다. */
export function gateFailure(code: GateFailure): {
  ok: false;
  status: 409;
  code: GateFailure;
  message: string;
} {
  return { ok: false, status: 409, code, message: GATE_MESSAGES[code] };
}

/** 재요청 프롬프트에 붙일 문제 목록. 잘림이면 분량 축소 문구, 아니면 검증 문제 목록이다. */
export function retryNotesFor(
  issues: ValidationIssue[],
  truncated: boolean,
): string[] {
  return truncated ? [TRUNCATED_RETRY_NOTE] : buildRetryNote(issues);
}

type Failure = "validation" | "upstream" | "timeout" | "fatal";

type Failed = { ok: false; failure: Failure; issues: ValidationIssue[] };
type Retryable = {
  ok: false;
  failure: "retry";
  issues: ValidationIssue[];
  truncated: boolean;
};
type CallResult<TParsed> = { ok: true; value: TParsed } | Failed | Retryable;

/** 재요청한 뒤에도 재요청 대상 실패이면 검증 실패로 확정한다. */
function settle<TParsed>(
  r: CallResult<TParsed>,
): { ok: true; value: TParsed } | Failed {
  if (r.ok || r.failure !== "retry") return r;
  return { ok: false, failure: "validation", issues: r.issues };
}

export async function runGeneration<TParsed, TSaved>(
  db: Db,
  userId: string,
  sessionId: string,
  spec: GenerationSpec<TParsed, TSaved>,
  deps: GenerationDeps,
): Promise<GenerationOutcome<TSaved>> {
  const { mode } = spec;
  const pre = spec.precheck();
  if (!pre.ok) {
    const { ok: _ok, ...rest } = pre;
    return { kind: "precheck", ...rest };
  }

  const claim = await claimGeneration(db, sessionId, userId, mode);
  if (claim.kind === "invalid") {
    throw new Error("fn_inquiry_claim_generation 반환값을 해석할 수 없습니다.");
  }
  if (claim.kind !== "claimed") {
    if (claim.kind === "exhausted") {
      await terminateAndReverse(db, userId, sessionId, mode, "exhausted");
    }
    return {
      kind: "claim_error",
      code:
        claim.kind === "running"
          ? "GENERATION_RUNNING"
          : claim.kind === "exhausted"
            ? "ATTEMPTS_EXHAUSTED"
            : "SESSION_NOT_OPEN",
      attempts: claim.kind === "exhausted" ? claim.attempts : null,
      terminal: claim.kind === "exhausted",
      generation: await readGeneration(db, userId, sessionId),
    };
  }

  // 모델 호출 기록은 어떤 경로로 끝나도 응답 직전에 한 번 내보낸다.
  const trace = createAiTrace({
    service: "inquiry",
    feature: mode,
    targetKind: "inquiry_session",
    targetId: sessionId,
    profileId: userId,
  });

  const left = (): number =>
    GENERATION_BUDGET_MS - (Date.now() - deps.startedAt);

  /** 모델 호출 1회와 파싱, 검증. 재요청할 만한 실패는 retry 로 돌려준다. */
  const callOnce = async (
    bundle: PromptBundle,
    lastIssues: ValidationIssue[],
    reason: string | null,
  ): Promise<CallResult<TParsed>> => {
    const remaining = left();
    if (remaining <= 0) {
      return { ok: false, failure: "timeout", issues: lastIssues };
    }
    trace.beginAttempt(reason);
    let reply: { text: string; finishReason: string | null };
    try {
      reply = await withinBudget(
        (abortSignal) =>
          deps.callStructured(bundle.system, bundle.user, {
            responseMimeType: "application/json",
            responseSchema: bundle.responseSchema,
            maxOutputTokens: bundle.maxOutputTokens,
            abortSignal,
            telemetry: trace,
          }),
        remaining,
      );
    } catch (e) {
      if (e instanceof DeadlineExceeded) {
        return { ok: false, failure: "timeout", issues: lastIssues };
      }
      console.error("inquiry 모델 호출 실패:", e);
      return {
        ok: false,
        failure: "upstream",
        issues: [
          { code: "upstream_error", message: "모델 호출에 실패했습니다." },
        ],
      };
    }
    // 잘린 응답은 우연히 파싱돼도 뒷부분이 비어 있을 수 있어 쓰지 않는다.
    if (reply.finishReason === "MAX_TOKENS") {
      trace.annotateLastCall({
        validation: "failed",
        issueCodes: ["truncated"],
      });
      return {
        ok: false,
        failure: "retry",
        truncated: true,
        issues: [
          { code: "truncated", message: "응답이 출력 한도를 넘어 잘렸습니다." },
        ],
      };
    }
    const parsed = parseJsonResponse(reply.text);
    if (!parsed.ok) {
      trace.annotateLastCall({
        validation: "failed",
        issueCodes: [parsed.issue.code],
      });
      return {
        ok: false,
        failure: "retry",
        truncated: false,
        issues: [parsed.issue],
      };
    }
    const verdict = spec.validate(parsed.value);
    if (!verdict.ok) {
      trace.annotateLastCall({
        validation: "failed",
        issueCodes: verdict.issues.map((i) => i.code),
      });
      return {
        ok: false,
        failure: "retry",
        truncated: false,
        issues: verdict.issues,
      };
    }
    trace.annotateLastCall({ validation: "ok" });
    return { ok: true, value: verdict.value };
  };

  /** 실패를 기록하고 종결 여부를 판단한다. 다른 요청이 선점을 가져갔으면 그 요청이 결과를 정한다. */
  const closeFailed = async (
    failure: Failure,
    issues: ValidationIssue[],
    extraAttempts: number,
  ): Promise<GenerationOutcome<TSaved>> => {
    const closed = await finishGeneration(
      db,
      sessionId,
      userId,
      mode,
      false,
      issues,
      extraAttempts,
    );
    let generation = await readGeneration(db, userId, sessionId);
    if (!closed) {
      return {
        kind: "claim_error",
        code: "GENERATION_RUNNING",
        attempts: null,
        terminal: false,
        generation,
      };
    }
    const attempts = generation.modes[mode].attempts;
    const terminal = failure === "fatal" || shouldTerminate(failure, attempts);
    if (terminal) {
      await terminateAndReverse(
        db,
        userId,
        sessionId,
        mode,
        failure === "fatal" ? "fatal" : "exhausted",
      );
      generation = await readGeneration(db, userId, sessionId);
    }
    return { kind: "failure", failure, issues, attempts, terminal, generation };
  };

  // 이 아래에서 던지면 선점한 mode 를 실패로 닫고 다시 던진다(running 이 stale 까지 남지 않게).
  try {
    let extraAttempts = 0;
    let result = await callOnce(spec.prompt, [], null);
    if (!result.ok && result.failure === "retry") {
      extraAttempts = 1;
      result = await callOnce(
        spec.retryPrompt(result.issues, result.truncated),
        result.issues,
        result.truncated
          ? "truncated"
          : result.issues.map((i) => i.code).join(",") || null,
      );
    }
    const settled = settle(result);
    if (!settled.ok) {
      // 첫 호출이 재요청 대상이 아닌 실패(timeout, upstream)면 재요청은 시작하지 않았다.
      return await closeFailed(settled.failure, settled.issues, extraAttempts);
    }
    const parsedValue = settled.value;

    const attempts = claim.attempts + extraAttempts;
    let saved: TSaved;
    try {
      saved = await spec.persist(parsedValue, attempts);
    } catch (e) {
      console.error("inquiry 생성 결과 저장 실패:", e);
      return await closeFailed(
        "fatal",
        [{ code: "persist_failed", message: "결과를 저장하지 못했어요." }],
        extraAttempts,
      );
    }
    const closed = await finishGeneration(
      db,
      sessionId,
      userId,
      mode,
      true,
      [],
      extraAttempts,
    );
    // 결과는 이미 저장됐다. 선점이 넘어간 경우여도 저장분을 돌려준다.
    if (!closed) console.warn("inquiry 생성 종료가 반영되지 않았어요:", mode);
    return {
      kind: "ok",
      saved,
      attempts,
      generation: await readGeneration(db, userId, sessionId),
    };
  } catch (e) {
    try {
      await finishGeneration(
        db,
        sessionId,
        userId,
        mode,
        false,
        [{ code: "internal", message: "예기치 못한 오류" }],
        0,
      );
    } catch (inner) {
      console.error("inquiry 실패 기록 중 오류(무시):", inner);
    }
    throw e;
  } finally {
    await trace.flush(db);
  }
}

const CLAIM_ERRORS = {
  GENERATION_RUNNING: "이미 생성 중이에요. 잠시 뒤 다시 시도해 주세요.",
  ATTEMPTS_EXHAUSTED:
    "시도 가능 횟수를 모두 사용해 이 세션을 닫았어요. 새 세션으로 다시 시작해 주세요.",
  SESSION_NOT_OPEN: "이미 닫힌 세션이에요.",
} as const;

const FAILURE_ERRORS: Record<
  Failure,
  { status: number; code: string; message: string }
> = {
  validation: {
    status: 422,
    code: "GENERATION_VALIDATION_FAILED",
    message: "결과가 기준에 맞지 않아 만들지 못했어요. 다시 시도해 주세요.",
  },
  upstream: {
    status: 502,
    code: "MODEL_UPSTREAM_FAILED",
    message: "생성 서버가 응답하지 않았어요. 잠시 뒤 다시 시도해 주세요.",
  },
  timeout: {
    status: 504,
    code: "GENERATION_TIMEOUT",
    message: "생성 시간이 너무 오래 걸렸어요. 다시 시도해 주세요.",
  },
  fatal: {
    status: 500,
    code: "GENERATION_FATAL",
    message: "복구할 수 없는 오류가 생겨 세션을 닫았어요.",
  },
};

/** ok 가 아닌 outcome 을 HTTP 오류로 매핑한다(부록 B-1). ok 는 호출자가 직접 응답한다. */
export function generationErrorOf(
  outcome: Exclude<GenerationOutcome<unknown>, { kind: "ok" }>,
): {
  status: number;
  code: string;
  message: string;
  extra: Record<string, unknown>;
} {
  switch (outcome.kind) {
    case "precheck":
      return {
        status: outcome.status,
        code: outcome.code,
        message: outcome.message,
        extra: outcome.extra ?? {},
      };
    case "claim_error":
      return {
        status: 409,
        code: outcome.code,
        message: CLAIM_ERRORS[outcome.code],
        extra: {
          attempts: outcome.attempts,
          terminal: outcome.terminal,
          generation: outcome.generation,
        },
      };
    case "failure":
      return {
        ...FAILURE_ERRORS[outcome.failure],
        extra: {
          attempts: outcome.attempts,
          issues: outcome.issues,
          terminal: outcome.terminal,
          generation: outcome.generation,
        },
      };
  }
}
