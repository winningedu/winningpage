// 성장설계 회신 재전송(명세 No.75). 완료 때 회신이 실패하면 세션에 reply_pending 을 남기고,
// 다음 진입 때 서버가 다시 보낸다. 판정은 순수 함수, 호출과 저장은 resendPendingReplies 가 한다.

import type { Db } from "../growth/intake/collectDb.js";
import type { completePlanItemFromProgram } from "../growth/plan/complete.js";
import { updateSession } from "./db.js";
import type { SessionRow } from "./rows.js";
import type { ReplyPending } from "./types.js";

type CompleteResult = Awaited<ReturnType<typeof completePlanItemFromProgram>>;

/** 성공이면 대기를 비우고(null), 실패면 같은 항목으로 오류와 시각만 갱신한다. */
export function nextReplyState(
  prev: ReplyPending,
  result: CompleteResult,
  nowIso: string,
): ReplyPending | null {
  if (result.ok) return null;
  return {
    itemId: prev.itemId,
    refId: prev.refId,
    failedAt: nowIso,
    lastError: `${result.code}: ${result.message}`,
  };
}

export type ResendDeps = {
  complete: typeof completePlanItemFromProgram;
  now: Date;
};

export async function resendPendingReplies(
  db: Db,
  userId: string,
  sessions: Pick<SessionRow, "id" | "status" | "reply_pending">[],
  deps: ResendDeps,
): Promise<{ resent: number; failed: number }> {
  let resent = 0;
  let failed = 0;
  for (const s of sessions) {
    const pending = s.reply_pending;
    if (s.status !== "completed" || pending === null) continue;
    const result = await deps.complete(db, userId, {
      itemId: pending.itemId,
      program: "self",
      refId: pending.refId,
      nowIso: deps.now.toISOString(),
    });
    const next = nextReplyState(pending, result, deps.now.toISOString());
    await updateSession(db, userId, s.id, { reply_pending: next });
    if (next === null) resent += 1;
    else failed += 1;
  }
  return { resent, failed };
}
