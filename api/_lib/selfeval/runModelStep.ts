// 자기평가서 모델 호출 단계(analyze, write, verify)의 공통 실행기.
// 선점, 모델 루프(요청 안 재요청 1회), 종료, 종결을 한곳에 둔다. 성장설계
// api/_lib/growth/report/runStep.ts 와 advance.ts 를 같은 모양으로 옮긴 것이다.
// HTTP 를 모르고, 결과는 Outcome 으로 돌려준다. 응답 매핑은 outcomeToHttp 가 맡는다.

import type { callStructured } from "../gemini.js";
import { type AiTrace, createAiTrace } from "../telemetry/trace.js";
import type { Db } from "./db.js";
import {
  claimStep,
  finishStep,
  reverseCredit,
  terminateSession,
} from "./db.js";
import type { PromptBundle } from "./prompts.js";
import { buildRetryNotes } from "./prompts.js";
import type { SessionRow } from "./rows.js";
import {
  CLAIM_STALE_SECONDS,
  MAX_MODEL_ATTEMPTS_PER_STEP,
  type ModelStepKey,
  STEP_BUDGET_MS,
} from "./types.js";
import { parseModelJson, type ValidationIssue } from "./validation.js";

/** 요청 안에서 모델을 부르는 최대 횟수. 첫 시도와 재요청 1회(명세 No.81). */
const MAX_TRIES_PER_REQUEST = 2;

export type StepFailureKind = "validation" | "upstream" | "timeout" | "fatal";

export type Outcome<T> =
  | {
      kind: "ok";
      result: T;
      /** 이 단계의 모델 호출 누계(선점 때까지의 시도 포함). */
      attempts: number;
      softIssues: ValidationIssue[];
    }
  | { kind: "locked" }
  | { kind: "running" }
  | { kind: "order"; currentStep: number }
  | { kind: "superseded" }
  | { kind: "exhausted"; terminal: true }
  | {
      kind: "failure";
      failure: StepFailureKind;
      issues: ValidationIssue[];
      attempts: number;
      /** 시도 상한 때문에 세션이 종결(archived)됐는가. */
      terminal: boolean;
      /** 이 실패 때문에 차감을 되돌렸는가(검증 단계만 쓴다). */
      reversed?: boolean;
    }
  | { kind: "no_entitlement" }
  | { kind: "quota_exhausted" }
  | { kind: "regenerate_exhausted" }
  | {
      kind: "rejected";
      status: number;
      code: string;
      message: string;
      extra?: Record<string, unknown>;
    };

export type ModelStepDeps = {
  callStructured: typeof callStructured;
  now: () => string;
  /** 이 요청이 시작된 시각(Date.now). 단계 예산 계산에 쓴다. */
  startedAt: number;
};

export type StepSpec<T> = {
  /** 재요청 메모를 받아 프롬프트를 만든다. 첫 시도는 빈 배열이다. */
  build(retryNotes: string[]): PromptBundle;
  /** soft 사유만 있는 성공은 softIssues 로 알려 첫 시도에만 재요청하게 한다. */
  validate(value: unknown):
    | {
        ok: true;
        patch: Record<string, unknown>;
        result: T;
        softIssues?: ValidationIssue[];
      }
    | { ok: false; issues: ValidationIssue[] };
  /** validate 의 patch 에 덧붙이는 patch(예: regenerate_increment). */
  patchOnSuccess?: Record<string, unknown>;
};

/**
 * 세션을 종결하고 되돌릴 차감이 있으면 되돌린다. 되돌릴지는 종결 RPC 가 잠금 안에서
 * 판단한 needsReverse 만 믿는다. 되돌림 실패는 응답을 막지 않는다.
 */
export async function terminateAndReverse(
  db: Db,
  userId: string,
  sessionId: string,
  step: ModelStepKey | null,
  reason: string,
): Promise<void> {
  const t = await terminateSession(db, userId, sessionId, step, reason);
  if (!t.ok || !t.needsReverse) return;
  try {
    await reverseCredit(db, userId, sessionId, `selfeval:${reason}`);
  } catch (e) {
    console.error("selfeval 차감 되돌림 실패(무시):", e);
  }
}

type Success<T> = Extract<ReturnType<StepSpec<T>["validate"]>, { ok: true }>;

type LoopResult<T> =
  | { ok: true; value: Success<T>; tries: number }
  | {
      ok: false;
      failure: StepFailureKind;
      issues: ValidationIssue[];
      tries: number;
    };

/** 모델 호출과 검증을 최대 2회 한다. 시간 예산은 요청 시작 기준이다. */
async function modelLoop<T>(
  step: ModelStepKey,
  deps: ModelStepDeps,
  spec: StepSpec<T>,
  trace: AiTrace,
): Promise<LoopResult<T>> {
  let retryNotes: string[] = [];
  let issues: ValidationIssue[] = [];
  let failure: StepFailureKind = "validation";
  let tries = 0;
  // 첫 시도에서 soft 사유만 남은 성공. 재요청이 실패하면 이 결과를 쓴다.
  let held: Success<T> | null = null;

  for (let attempt = 0; attempt < MAX_TRIES_PER_REQUEST; attempt++) {
    const remaining =
      STEP_BUDGET_MS - (Date.parse(deps.now()) - deps.startedAt);
    if (!(remaining > 0)) {
      failure = "timeout";
      break;
    }
    trace.beginAttempt(
      attempt === 0 ? null : issues.map((i) => i.code).join(",") || null,
    );
    const bundle = spec.build(retryNotes);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let reply: { text: string; finishReason: string | null };
    tries++;
    try {
      reply = await deps.callStructured(bundle.system, bundle.user, {
        responseMimeType: "application/json",
        responseSchema: bundle.responseSchema as never,
        maxOutputTokens: bundle.maxOutputTokens,
        abortSignal: controller.signal,
        telemetry: trace,
      });
    } catch (e) {
      if (controller.signal.aborted) {
        failure = "timeout";
      } else {
        failure = "upstream";
        issues = [
          { code: "upstream_error", message: "모델 호출에 실패했습니다." },
        ];
        console.error(`selfeval ${step} 모델 호출 실패:`, e);
      }
      break;
    } finally {
      clearTimeout(timer);
    }

    const parsed = parseModelJson(reply.text, reply.finishReason);
    if (!parsed.ok) {
      trace.annotateLastCall({
        validation: "failed",
        issueCodes: [parsed.issue.code],
      });
      failure = "validation";
      issues = [parsed.issue];
      retryNotes = buildRetryNotes(issues);
      continue;
    }
    const verdict = spec.validate(parsed.value);
    if (!verdict.ok) {
      trace.annotateLastCall({
        validation: "failed",
        issueCodes: verdict.issues.map((i) => i.code),
      });
      failure = "validation";
      issues = verdict.issues;
      retryNotes = buildRetryNotes(issues);
      continue;
    }
    const soft = verdict.softIssues ?? [];
    if (soft.length > 0 && attempt === 0) {
      trace.annotateLastCall({
        validation: "failed",
        issueCodes: soft.map((i) => i.code),
      });
      held = verdict;
      issues = soft;
      retryNotes = buildRetryNotes(soft);
      continue;
    }
    trace.annotateLastCall({ validation: "ok" });
    return { ok: true, value: verdict, tries };
  }

  if (held !== null) return { ok: true, value: held, tries };
  return { ok: false, failure, issues, tries };
}

export async function runModelStep<T>(
  db: Db,
  userId: string,
  session: SessionRow,
  step: ModelStepKey,
  deps: ModelStepDeps,
  spec: StepSpec<T>,
): Promise<Outcome<T>> {
  const claim = await claimStep(
    db,
    userId,
    session.id,
    step,
    CLAIM_STALE_SECONDS,
  );
  if (claim.kind === "locked" || claim.kind === "running") {
    return { kind: claim.kind };
  }
  if (claim.kind === "order") {
    return { kind: "order", currentStep: claim.currentStep };
  }
  if (claim.kind === "exhausted") {
    await terminateAndReverse(db, userId, session.id, step, "exhausted");
    return { kind: "exhausted", terminal: true };
  }

  // 모델 호출 기록은 어떤 경로로 끝나도 응답 직전에 한 번 내보낸다.
  const trace = createAiTrace({
    service: "selfeval",
    feature: step,
    targetKind: "selfeval_session",
    targetId: session.id,
    profileId: userId,
  });

  // 여기서 던지면 선점한 running 이 stale 시간까지 남아 재요청이 막히므로 실패로 닫는다.
  try {
    const loop = await modelLoop(step, deps, spec, trace);
    const extraAttempts = Math.max(loop.tries - 1, 0);
    const attempts = claim.attempts + extraAttempts;

    if (loop.ok) {
      const closed = await finishStep(db, userId, session.id, step, {
        ok: true,
        patch: { ...loop.value.patch, ...spec.patchOnSuccess },
        extraAttempts,
      });
      if (!closed) return { kind: "superseded" };
      return {
        kind: "ok",
        result: loop.value.result,
        attempts,
        softIssues: loop.value.softIssues ?? [],
      };
    }

    const closed = await finishStep(db, userId, session.id, step, {
      ok: false,
      issues: loop.issues,
      extraAttempts,
    });
    // 다른 요청이 이 단계를 가져갔으면 그 요청이 결과를 정한다.
    if (!closed) return { kind: "superseded" };
    const terminal = attempts >= MAX_MODEL_ATTEMPTS_PER_STEP;
    if (terminal) {
      await terminateAndReverse(db, userId, session.id, step, "exhausted");
    }
    return {
      kind: "failure",
      failure: loop.failure,
      issues: loop.issues,
      attempts,
      terminal,
    };
  } catch (e) {
    console.error(`selfeval ${step} 단계 예기치 못한 오류:`, e);
    const issues = [{ code: "internal", message: "예기치 못한 오류" }];
    try {
      await finishStep(db, userId, session.id, step, { ok: false, issues });
    } catch (inner) {
      console.error("selfeval 실패 기록 중 오류(무시):", inner);
    }
    return {
      kind: "failure",
      failure: "fatal",
      issues,
      attempts: claim.attempts,
      terminal: false,
    };
  } finally {
    await trace.flush(db);
  }
}

// ---------------------------------------------------------------------------
// HTTP 매핑. 핸들러 넷이 같은 응답을 내도록 한곳에 둔다.
// ---------------------------------------------------------------------------

export type HttpMapping = {
  status: number;
  code: string;
  message: string;
  extra: Record<string, unknown>;
};

const FAILURES: Record<StepFailureKind, Omit<HttpMapping, "extra">> = {
  validation: {
    status: 422,
    code: "STEP_VALIDATION_FAILED",
    message: "결과가 기준을 통과하지 못했어요. 다시 시도해 주세요.",
  },
  upstream: {
    status: 502,
    code: "MODEL_UPSTREAM_FAILED",
    message: "분석 서버 응답에 실패했어요. 잠시 뒤 다시 시도해 주세요.",
  },
  timeout: {
    status: 504,
    code: "STEP_TIMEOUT",
    message: "처리 시간이 초과됐어요. 다시 시도해 주세요.",
  },
  fatal: {
    status: 500,
    code: "STEP_FATAL",
    message: "처리 중 복구할 수 없는 오류가 났어요.",
  },
};

export function outcomeToHttp(outcome: Outcome<unknown>): HttpMapping {
  switch (outcome.kind) {
    case "ok":
      return {
        status: 200,
        code: "OK",
        message: "",
        extra: { attempts: outcome.attempts, softIssues: outcome.softIssues },
      };
    case "locked":
      return {
        status: 409,
        code: "SESSION_NOT_OPEN",
        message: "이 자기평가서는 더 이상 진행할 수 없어요.",
        extra: {},
      };
    case "running":
      return {
        status: 409,
        code: "STEP_RUNNING",
        message: "같은 단계가 이미 진행 중이에요. 잠시 뒤 다시 확인해 주세요.",
        extra: {},
      };
    case "order":
      return {
        status: 409,
        code: "STEP_ORDER",
        message: "앞 단계가 아직 끝나지 않았어요.",
        extra: { currentStep: outcome.currentStep },
      };
    case "superseded":
      return {
        status: 409,
        code: "STEP_SUPERSEDED",
        message: "다른 요청이 이미 이 단계를 처리했어요.",
        extra: {},
      };
    case "exhausted":
      return {
        status: 409,
        code: "ATTEMPTS_EXHAUSTED",
        message: "이 단계의 시도 횟수를 모두 사용했어요.",
        extra: { terminal: true },
      };
    case "failure":
      return {
        ...FAILURES[outcome.failure],
        extra: {
          attempts: outcome.attempts,
          issues: outcome.issues,
          ...(outcome.terminal && { terminal: true }),
          ...(outcome.reversed !== undefined && {
            reversed: outcome.reversed,
          }),
        },
      };
    case "no_entitlement":
      return {
        status: 403,
        code: "NO_ENTITLEMENT",
        message: "자기평가서 이용권이 필요해요.",
        extra: {},
      };
    case "quota_exhausted":
      return {
        status: 409,
        code: "QUOTA_EXHAUSTED",
        message: "남은 이용 횟수가 없어요. 이용권을 확인해 주세요.",
        extra: {},
      };
    case "regenerate_exhausted":
      return {
        status: 409,
        code: "REGENERATE_EXHAUSTED",
        message: "다시 생성할 수 있는 횟수를 모두 사용했어요.",
        extra: {},
      };
    case "rejected":
      return {
        status: outcome.status,
        code: outcome.code,
        message: outcome.message,
        extra: outcome.extra ?? {},
      };
  }
}

/** 모델을 부르지 않는 단계 조작(분석 저장, 편집 저장 등)의 결과. */
export type SimpleOutcome<T> =
  | { kind: "done"; result: T }
  | Extract<Outcome<never>, { kind: "order" | "rejected" }>;
