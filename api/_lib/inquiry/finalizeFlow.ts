// 확정 요청의 순수 판단(부록 B 4번, 개발계획 §2 21, 22). DB 와 RPC 호출은 핸들러와 evaluateDb 가 한다.
import type { CompleteInput, CompleteResult } from "../growth/plan/complete.js";
import { type FlowError, isUuid } from "./evaluateFlow.js";
import { validateFinalFields } from "./extract.js";
import { decideReplyOutcome } from "./reply.js";
import { gateFor } from "./session.js";
import type { ActivityFields, SessionStatus } from "./types.js";

export type FinalizeBodyResult =
  | { ok: true; sessionId: string; fields: ActivityFields }
  | { ok: false; reason: string; missing?: string[] };

/** 요청 본문 { sessionId, fields }. 7항목 검증은 validateFinalFields 가 한다. */
export function parseFinalizeBody(body: unknown): FinalizeBodyResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, reason: "요청 본문이 올바르지 않아요." };
  }
  const { sessionId, fields } = body as Record<string, unknown>;
  if (!isUuid(sessionId)) {
    return { ok: false, reason: "sessionId 가 올바르지 않아요." };
  }
  const checked = validateFinalFields(fields);
  if (!checked.ok) {
    return {
      ok: false,
      reason: "비어 있는 항목이 있어요.",
      missing: checked.missing,
    };
  }
  return { ok: true, sessionId, fields: checked.fields };
}

/** 확정 전 단계 검사. 평가가 있어야 하고 세션이 열려 있어야 한다. */
export function precheckFinalize(session: {
  selectedTopicId: string | null;
  designReportId: string | null;
  latestEvaluationId: string | null;
  status: SessionStatus;
}): { ok: true } | FlowError {
  const gate = gateFor(session, "finalize");
  if (gate.ok) return { ok: true };
  return {
    ok: false,
    status: 409,
    code: gate.code,
    message:
      gate.code === "STEP_ORDER"
        ? "평가 리포트를 먼저 받아 주세요."
        : "이미 닫힌 세션이에요.",
  };
}

export type FinalizeMapped =
  | {
      ok: true;
      status: "completed" | "already_completed";
      activityRecordId: string | null;
      finalReportId: string | null;
    }
  | FlowError;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const idOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;

/** fn_inquiry_finalize 반환(jsonb)을 HTTP 로 옮긴다. 정의에 없는 반환은 던져 500 이 되게 한다. */
export function mapFinalizeRpc(raw: unknown): FinalizeMapped {
  const status = isRecord(raw) ? raw.status : undefined;
  switch (status) {
    case "completed":
    case "already_completed":
      return {
        ok: true,
        status,
        activityRecordId: idOrNull(
          (raw as Record<string, unknown>).activityRecordId,
        ),
        finalReportId: idOrNull((raw as Record<string, unknown>).finalReportId),
      };
    case "not_ready":
      return {
        ok: false,
        status: 409,
        code: "STEP_ORDER",
        message: "평가 리포트를 먼저 받아 주세요.",
      };
    case "fields_missing": {
      const missing = (raw as Record<string, unknown>).missing;
      return {
        ok: false,
        status: 400,
        code: "INVALID_BODY",
        message: "비어 있는 항목이 있어요.",
        extra: { missing: Array.isArray(missing) ? missing : [] },
      };
    }
    case "session_not_found":
      return {
        ok: false,
        status: 404,
        code: "SESSION_NOT_FOUND",
        message: "세션을 찾을 수 없어요.",
      };
    default:
      throw new Error(
        `fn_inquiry_finalize 반환 형식 오류: ${JSON.stringify(raw)}`,
      );
  }
}

/** 성장설계 회신 입력. 과제나 활동 기록 id 가 없으면 보낼 수 없다. */
export function replyInputFor(
  planItemId: string | null,
  activityRecordId: string | null,
): CompleteInput | null {
  if (!planItemId || !activityRecordId) return null;
  return { itemId: planItemId, program: "deep", refId: activityRecordId };
}

/** 회신 결과를 응답의 replySent 와 세션의 reply_pending 으로 옮긴다. */
export function replyOutcomeOf(result: CompleteResult): {
  replySent: boolean;
  replyPending: boolean;
} {
  const clear = decideReplyOutcome(result) === "clear";
  return { replySent: clear, replyPending: !clear };
}
