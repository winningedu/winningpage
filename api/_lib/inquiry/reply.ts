// 성장설계 회신 재전송(부록 A 1번, 개발계획 §2 22). 확정 때 회신이 실패해 reply_pending 이 선 세션을
// 다음 세션 호출에서 다시 보낸다. 판단은 decideReplyOutcome 에 두고 DB 호출은 얇게 유지한다.
import type { CompleteInput, CompleteResult } from "../growth/plan/complete.js";
import {
  clearReplyPending,
  type Db,
  loadActivityRecordForSession,
  loadReplyPendingSessions,
} from "./db.js";

export type ReplyDeps = {
  complete: (
    db: Db,
    userId: string,
    input: CompleteInput,
  ) => Promise<CompleteResult>;
};

/** 성공(변경 없는 성공 포함)이면 표시를 풀고, 실패면 다음 호출에서 다시 시도하도록 둔다. */
export function decideReplyOutcome(result: CompleteResult): "clear" | "keep" {
  return result.ok ? "clear" : "keep";
}

/** 한 건이라도 회신해 표시를 풀었으면 true. */
export async function resendPendingReplies(
  db: Db,
  userId: string,
  deps: ReplyDeps,
): Promise<boolean> {
  const sessions = await loadReplyPendingSessions(db, userId);
  let resent = false;
  for (const session of sessions) {
    try {
      if (!session.plan_item_id) {
        // 회신할 과제가 없으면 다시 보낼 것도 없다.
        await clearReplyPending(db, userId, session.id);
        continue;
      }
      const record = await loadActivityRecordForSession(db, userId, session.id);
      if (!record) continue;
      const result = await deps.complete(db, userId, {
        itemId: session.plan_item_id,
        program: "deep",
        refId: record.id,
      });
      if (decideReplyOutcome(result) === "clear") {
        await clearReplyPending(db, userId, session.id);
        resent = true;
      }
    } catch (error) {
      // 회신 실패가 세션 진입을 막으면 안 된다. 표시를 둔 채 다음 호출에서 다시 시도한다.
      console.error("inquiry/reply 재전송 실패(무시):", session.id, error);
    }
  }
  return resent;
}
