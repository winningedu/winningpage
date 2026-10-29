// 관리자 서비스이용횟수조정(POST /api/admin/service-credit-adjust)의 순수 규칙.
//
// 값을 덮어쓰는 set 이 아니라 delta(추가/차감)로만 조정한다. 부여 원장
// (program_access_grants)과 소비 원장(performance_credit_ledger)은 DELETE 를 하지 않는
// 추가 전용이라, 조정도 새 행으로 남아야 감사 추적이 된다.
//   - delta > 0: program_access_grants 에 admin 부여 행을 넣는다.
//   - delta < 0: performance_credit_ledger 에 source_kind='admin_adjustment' 소비 행을
//     넣는다(DB 함수 fn_admin_deduct_service_credit, advisory 잠금 101 안에서).

import { addMonthsUtc } from "../growth/ops/grant.js";
import { SERVICE_CREDIT_PROGRAMS } from "./programs.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

const REASON_MIN_LENGTH = 2;
const ADJUST_MEMO_PREFIX = "관리자 이용횟수 조정: ";

export type AdjustBody = {
  profileId: string;
  programKey: string;
  delta: number;
  months: number | null;
  reason: string;
};

export function validateAdjustBody(
  raw: unknown,
): { ok: true; body: AdjustBody } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, reason: "요청 본문이 올바르지 않습니다." };
  const b = raw as Record<string, unknown>;

  if (typeof b.profileId !== "string" || !UUID_RE.test(b.profileId.trim()))
    return { ok: false, reason: "profileId 가 올바르지 않습니다." };

  const program = SERVICE_CREDIT_PROGRAMS.find(
    (p) => p.programKey === b.programKey,
  );
  if (!program)
    return { ok: false, reason: "programKey 가 올바르지 않습니다." };

  if (
    typeof b.delta !== "number" ||
    !Number.isInteger(b.delta) ||
    b.delta === 0
  )
    return { ok: false, reason: "delta 는 0 이 아닌 정수여야 합니다." };

  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length < REASON_MIN_LENGTH)
    return {
      ok: false,
      reason: `reason 은 ${REASON_MIN_LENGTH}자 이상이어야 합니다.`,
    };

  let months: number | null = null;
  if (b.months !== undefined && b.months !== null) {
    if (
      typeof b.months !== "number" ||
      !Number.isInteger(b.months) ||
      b.months < 1
    )
      return { ok: false, reason: "months 는 1 이상의 정수여야 합니다." };
    months = b.months;
  }

  if (b.delta < 0) {
    if (program.periodBased)
      return { ok: false, reason: "기간형 서비스는 차감할 수 없습니다." };
    if (months !== null)
      return { ok: false, reason: "차감에는 months 를 줄 수 없습니다." };
  } else if (program.periodBased && months === null) {
    return { ok: false, reason: "기간형 서비스는 months 가 필요합니다." };
  }

  return {
    ok: true,
    body: {
      profileId: b.profileId.trim(),
      programKey: program.programKey,
      delta: b.delta,
      months,
      reason,
    },
  };
}

export type AdjustGrantRow = {
  profile_id: string;
  program_key: string;
  granted_by: "admin";
  granted_by_actor: string;
  granted_sessions: number | null;
  granted_months: number | null;
  validity_days: null;
  paid_amount: number;
  starts_at: string;
  expires_at: string | null;
  memo: string;
};

/**
 * delta > 0 의 부여 행. 제약(pag_entitlement_shape_check, pag_expiry_derivation_check):
 * 기간형(target)은 granted_sessions 를 null 로 두고 granted_months 를 채운다. 회차형은
 * granted_sessions=delta 이고 months 가 있을 때만 granted_months 와 expires_at 을 채운다.
 */
export function buildAdjustGrantRow(
  body: AdjustBody,
  actorId: string,
  nowIso: string,
): AdjustGrantRow {
  const periodBased = SERVICE_CREDIT_PROGRAMS.some(
    (p) => p.programKey === body.programKey && p.periodBased,
  );
  return {
    profile_id: body.profileId,
    program_key: body.programKey,
    granted_by: "admin",
    granted_by_actor: actorId,
    granted_sessions: periodBased ? null : body.delta,
    granted_months: body.months,
    validity_days: null,
    paid_amount: 0,
    starts_at: nowIso,
    expires_at: body.months === null ? null : addMonthsUtc(nowIso, body.months),
    memo: `${ADJUST_MEMO_PREFIX}${body.reason}`,
  };
}

export type CreditSummary = {
  liveCount: number;
  quotaTotal: number | null;
  quotaUsed: number;
};

export type DeductionCheck =
  | { ok: true }
  | {
      ok: false;
      code: "NO_ENTITLEMENT" | "UNLIMITED_SESSIONS" | "INSUFFICIENT_CREDIT";
      message: string;
    };

/** 차감 전 잔여 확인. 최종 판정은 DB 함수가 잠금 안에서 다시 한다. */
export function checkDeduction(
  summary: CreditSummary,
  amount: number,
): DeductionCheck {
  if (summary.liveCount === 0)
    return {
      ok: false,
      code: "NO_ENTITLEMENT",
      message: "차감할 이용권이 없습니다.",
    };
  if (summary.quotaTotal === null)
    return {
      ok: false,
      code: "UNLIMITED_SESSIONS",
      message: "회차 무제한 이용권은 차감할 수 없습니다.",
    };
  const remaining = Math.max(summary.quotaTotal - summary.quotaUsed, 0);
  if (amount > remaining)
    return {
      ok: false,
      code: "INSUFFICIENT_CREDIT",
      message: `잔여 ${remaining}회보다 많이 차감할 수 없습니다.`,
    };
  return { ok: true };
}

/** 원장에는 행위자 컬럼이 없어 사유에 행위자 id 를 붙여 남긴다. */
export function buildDeductArgs(body: AdjustBody, actorId: string) {
  return {
    p_profile_id: body.profileId,
    p_program_key: body.programKey,
    p_amount: -body.delta,
    p_reason: `관리자 이용횟수 조정(${actorId}): ${body.reason}`,
  };
}
