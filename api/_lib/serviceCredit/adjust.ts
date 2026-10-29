// 관리자 서비스이용횟수조정(POST /api/admin/service-credit-adjust)의 순수 규칙.
//
// 값을 덮어쓰는 set 이 아니라 delta(추가/차감)로만 조정한다. 부여 원장
// (program_access_grants)과 소비 원장(performance_credit_ledger)은 DELETE 를 하지 않는
// 추가 전용이라, 조정도 새 행으로 남아야 감사 추적이 된다.
//   - delta > 0: program_access_grants 에 admin 부여 행을 넣는다.
//   - delta < 0: performance_credit_ledger 에 source_kind='admin_adjustment' 소비 행을
//     넣는다(DB 함수 fn_admin_deduct_service_credit, advisory 잠금 101 안에서).

import { SERVICE_CREDIT_PROGRAMS } from "./programs.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MIN_LENGTH = 2;

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
  if (!program) return { ok: false, reason: "programKey 가 올바르지 않습니다." };

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
