// write 와 verify 가 함께 쓰는 차감 보조(계획서 §2 8, 명세 No.16, No.81).
// 정본 차감과 되돌림은 DB RPC 가 하고, 여기서는 선점 전 확인과 호출 결과 해석만 한다.
// 성장설계 api/_lib/growth/report/advance.ts 의 차감 처리와 같은 방침이다.

import { hasSelfevalAccess, readSelfevalQuota } from "../access.js";
import { consumeCredit, type Db, reverseCredit } from "../db.js";
import type { SessionRow } from "../rows.js";
import type { Outcome } from "../runModelStep.js";

type ChargeRow = Pick<SessionRow, "ledger_id" | "ledger_reversed_at">;

/** 차감 이력이 없거나 되돌려졌으면 이번 성공에서 차감해야 한다. */
export function needsCharge(session: ChargeRow): boolean {
  return session.ledger_id === null || session.ledger_reversed_at !== null;
}

/** 차감했고 아직 되돌리지 않은 세션. */
export function hasActiveCharge(session: ChargeRow): boolean {
  return !needsCharge(session);
}

/**
 * 선점 전에 막아야 거절된 요청이 시도 횟수를 올리지 않는다. 차감이 필요 없으면 읽지 않는다.
 * 통과면 null, 거절이면 그 Outcome 을 돌려준다.
 */
export async function checkChargeGate(
  db: Db,
  userId: string,
  session: ChargeRow,
): Promise<Extract<
  Outcome<never>,
  { kind: "no_entitlement" | "quota_exhausted" }
> | null> {
  if (!needsCharge(session)) return null;
  if (!(await hasSelfevalAccess(db, userId))) return { kind: "no_entitlement" };
  const quota = await readSelfevalQuota(db, userId);
  if (quota.quotaRemaining === 0) return { kind: "quota_exhausted" };
  return null;
}

/**
 * 성공 뒤 차감. 거절되거나 던져도 진행은 막지 않고 charged false 로 알린다(성장설계 패턴).
 * 이미 차감된 세션의 재요청(already_charged)은 차감된 것으로 본다.
 */
export async function chargeAfterSuccess(
  db: Db,
  userId: string,
  sessionId: string,
  reason: string,
): Promise<boolean> {
  try {
    const r = (await consumeCredit(db, userId, sessionId, reason)) as {
      status?: string;
    };
    const charged = r.status === "charged" || r.status === "already_charged";
    if (!charged) console.warn("selfeval 차감 거절:", r.status);
    return charged;
  } catch (e) {
    console.error("selfeval 차감 실패:", e);
    return false;
  }
}

/** 검증 실패 때 활성 차감을 되돌린다. 실제로 되돌렸으면 true, 되돌림 실패는 응답을 막지 않는다. */
export async function reverseAfterFailure(
  db: Db,
  userId: string,
  session: ChargeRow & { id: string },
  reason: string,
): Promise<boolean> {
  if (!hasActiveCharge(session)) return false;
  try {
    const r = (await reverseCredit(db, userId, session.id, reason)) as {
      reversed?: boolean;
    };
    return r.reversed === true;
  } catch (e) {
    console.error("selfeval 차감 되돌림 실패(무시):", e);
    return false;
  }
}
