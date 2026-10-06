// 최종 저장 단계(계획서 §2 9, 명세 No.63, No.75, No.132). 모델을 부르지 않는다.
// 저장, 승격, 세션 완료는 DB RPC 가 한 트랜잭션으로 하고, 이 모듈은 사전 조건 판정,
// 요청 본문 검증, 성장설계 회신을 맡는다.

import type { completePlanItemFromProgram } from "../../growth/plan/complete.js";
import { type Db, finalizeSession, updateSession } from "../db.js";
import type { ReportRow, SessionRow } from "../rows.js";
import type { SimpleOutcome } from "../runModelStep.js";
import { guardStep } from "../session.js";
import type { PromotedRecord, VerificationSections } from "../types.js";
import { detailBody } from "../view.js";
import { isRecord, isUuid } from "./shared.js";

export type FinalizeBody = {
  sessionId: string;
  promoted: PromotedRecord;
  fulfillsPlanItem: boolean;
};

export type FinalizeBodyError = {
  ok: false;
  code: "INVALID_BODY" | "PROMOTED_INVALID";
  message: string;
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

function readPromoted(raw: unknown): PromotedRecord | null {
  if (!isRecord(raw)) return null;
  const { topic, concept, method, result, limitation, numbers, sources } = raw;
  if (
    typeof topic !== "string" ||
    topic.trim() === "" ||
    typeof concept !== "string" ||
    typeof method !== "string" ||
    typeof result !== "string" ||
    typeof limitation !== "string" ||
    !isStringArray(numbers) ||
    !isStringArray(sources)
  ) {
    return null;
  }
  return {
    topic: topic.trim(),
    concept,
    method,
    result,
    limitation,
    numbers,
    sources,
  };
}

export function validateFinalizeBody(
  body: unknown,
): { ok: true; body: FinalizeBody } | FinalizeBodyError {
  const invalid = (message: string): FinalizeBodyError => ({
    ok: false,
    code: "INVALID_BODY",
    message,
  });
  if (!isRecord(body) || !isUuid(body.sessionId)) {
    return invalid("sessionId 형식이 올바르지 않아요.");
  }
  const fulfills = body.fulfillsPlanItem ?? true;
  if (typeof fulfills !== "boolean") {
    return invalid("fulfillsPlanItem 은 true 또는 false 여야 해요.");
  }
  const promoted = readPromoted(body.promoted);
  if (promoted === null) {
    return {
      ok: false,
      code: "PROMOTED_INVALID",
      message: "활동 기록으로 남길 7항목을 확인해 주세요.",
    };
  }
  return {
    ok: true,
    body: { sessionId: body.sessionId, promoted, fulfillsPlanItem: fulfills },
  };
}

// ---------------------------------------------------------------------------
// 사전 조건
// ---------------------------------------------------------------------------

export type FinalizeBlock =
  | "STEP_ORDER"
  | "VERIFICATION_MISSING"
  | "VERIFICATION_STALE"
  | "NOT_SUBMITTABLE";

/**
 * 최종 저장 가능 여부. 검증 뒤에 본문이 바뀌었으면(편집 또는 재생성) 점수가 지금 글의 것이
 * 아니므로 막는다. 서버가 한 번 더 막아야 화면을 우회한 저장이 점수 없이 들어가지 않는다.
 */
export function canFinalize(
  session: Pick<SessionRow, "current_step">,
  reports: ReportRow[],
): { ok: true } | { ok: false; code: FinalizeBlock } {
  if (
    !guardStep(session.current_step as SessionRow["current_step"], "finalize")
      .ok
  ) {
    return { ok: false, code: "STEP_ORDER" };
  }
  const { reports: latest, current } = detailBody(
    session as SessionRow,
    [],
    reports,
  );
  const verification = latest.verification;
  if (verification === null || current === null) {
    return { ok: false, code: "VERIFICATION_MISSING" };
  }
  if (Date.parse(current.createdAt) > Date.parse(verification.createdAt)) {
    return { ok: false, code: "VERIFICATION_STALE" };
  }
  const sections = verification.sections as Partial<VerificationSections>;
  if (sections.submittable !== true) {
    return { ok: false, code: "NOT_SUBMITTABLE" };
  }
  return { ok: true };
}

const BLOCK_MESSAGES: Record<Exclude<FinalizeBlock, "STEP_ORDER">, string> = {
  VERIFICATION_MISSING: "검증을 먼저 해 주세요.",
  VERIFICATION_STALE: "검증 뒤에 본문이 바뀌었어요. 다시 검증해 주세요.",
  NOT_SUBMITTABLE: "필수 수정이 남아 있어 저장할 수 없어요.",
};

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

export type ReplyStatus =
  | { status: "sent" }
  | { status: "skipped" }
  | { status: "failed"; code: string };

export type FinalizeResult = {
  activityRecordId: string;
  finalRevision: number;
  reply: ReplyStatus;
  currentStep: 6;
};

export type FinalizeDeps = {
  complete: typeof completePlanItemFromProgram;
  now: () => string;
};

type FinalizeRpc =
  | {
      ok: true;
      reason: "completed" | "already_completed";
      activityRecordId: string;
      finalRevision: number;
    }
  | { ok: false; reason: "not_found" | "not_ready" };

/** 최종 저장 RPC 결과를 정규화한다. 모르는 모양이면 던진다. */
function interpretFinalize(raw: unknown): FinalizeRpc {
  const fail = (): never => {
    throw new Error(
      `최종 저장 결과를 해석할 수 없습니다: ${JSON.stringify(raw)}`,
    );
  };
  if (!isRecord(raw)) return fail();
  if (raw.ok === false) {
    return raw.reason === "not_found" || raw.reason === "not_ready"
      ? { ok: false, reason: raw.reason }
      : fail();
  }
  if (
    raw.ok === true &&
    (raw.reason === "completed" || raw.reason === "already_completed") &&
    typeof raw.activityRecordId === "string" &&
    typeof raw.finalRevision === "number"
  ) {
    return {
      ok: true,
      reason: raw.reason,
      activityRecordId: raw.activityRecordId,
      finalRevision: raw.finalRevision,
    };
  }
  return fail();
}

/** 성장설계에 확정 회신을 보낸다. 실패해도 저장은 유효하고 다음 진입 때 다시 보낸다(명세 No.75). */
async function replyToGrowth(
  db: Db,
  userId: string,
  session: SessionRow,
  body: FinalizeBody,
  rpc: Extract<FinalizeRpc, { ok: true }>,
  deps: FinalizeDeps,
): Promise<ReplyStatus> {
  const itemId = session.plan_item_id;
  if (itemId === null || !body.fulfillsPlanItem) return { status: "skipped" };
  // 완료 뒤 재요청에 회신 대기가 없으면 첫 요청에서 이미 보낸 것이다.
  if (rpc.reason === "already_completed" && session.reply_pending === null) {
    return { status: "sent" };
  }
  let failure: { code: string; message: string } | null = null;
  try {
    const r = await deps.complete(db, userId, {
      itemId,
      program: "self",
      refId: rpc.activityRecordId,
      nowIso: deps.now(),
    });
    if (!r.ok) failure = { code: r.code, message: r.message };
  } catch (e) {
    console.error("selfeval 성장설계 회신 실패:", e);
    failure = { code: "REPLY_ERROR", message: "회신 호출에 실패했어요." };
  }
  if (failure === null) {
    if (session.reply_pending !== null) {
      await updateSession(db, userId, session.id, { reply_pending: null });
    }
    return { status: "sent" };
  }
  await updateSession(db, userId, session.id, {
    reply_pending: {
      itemId,
      refId: rpc.activityRecordId,
      failedAt: deps.now(),
      lastError: `${failure.code}: ${failure.message}`,
    },
  });
  return { status: "failed", code: failure.code };
}

export async function runFinalize(
  db: Db,
  userId: string,
  session: SessionRow,
  reports: ReportRow[],
  body: FinalizeBody,
  deps: FinalizeDeps,
): Promise<SimpleOutcome<FinalizeResult>> {
  // 완료된 세션의 재요청은 RPC 가 멱등으로 처리하므로 사전 조건을 다시 보지 않는다.
  if (session.status !== "completed") {
    const can = canFinalize(session, reports);
    if (!can.ok) {
      if (can.code === "STEP_ORDER") {
        return { kind: "order", currentStep: session.current_step };
      }
      return {
        kind: "rejected",
        status: 409,
        code: can.code,
        message: BLOCK_MESSAGES[can.code],
      };
    }
  }

  const { reports: latest, current } = detailBody(session, [], reports);
  const verification = latest.verification;
  if (
    current === null ||
    verification === null ||
    verification.score === null
  ) {
    throw new Error("최종 저장에 필요한 본문이나 검증 점수가 없습니다.");
  }
  const rpc = interpretFinalize(
    await finalizeSession(db, userId, session.id, {
      promoted: body.promoted,
      sections: current.sections,
      charCount: current.charCount,
      score: verification.score,
    }),
  );
  if (!rpc.ok) {
    return rpc.reason === "not_found"
      ? {
          kind: "rejected",
          status: 404,
          code: "SESSION_NOT_FOUND",
          message: "자기평가서 세션을 찾을 수 없어요.",
        }
      : {
          kind: "rejected",
          status: 409,
          code: "STEP_ORDER",
          message: "검증을 마친 뒤에 저장할 수 있어요.",
        };
  }
  return {
    kind: "done",
    result: {
      activityRecordId: rpc.activityRecordId,
      finalRevision: rpc.finalRevision,
      reply: await replyToGrowth(db, userId, session, body, rpc, deps),
      currentStep: 6,
    },
  };
}
