// selfeval_manual_logs 읽기와 쓰기. service_role 이라 호출 쪽이 세션 소유를 먼저 확인한다.
// 모든 쿼리에 session_id 조건을 건다. 단위 테스트는 두지 않는다(manualLogsRun 의 가짜 저장소로 검증).

import { type Db, must } from "../growth/intake/collectDb.js";
import type { ManualStore, MemoRow } from "./manualLogsRun.js";

const COLUMNS =
  "id, session_id, written_at, text, ocr, confirmed, included, belongs_to";

/**
 * 수기 업로드 호출을 세션당 상한 안에서 하나 센다. 세는 일은 DB 함수가 세션 행 잠금 안에서 한다.
 * 상한 안이면 true, 다 썼으면 false. 닫힌 세션이나 알 수 없는 응답은 던진다.
 */
export async function claimUploadAttempt(
  db: Db,
  userId: string,
  sessionId: string,
  cap: number,
): Promise<boolean> {
  const { data, error } = await db.rpc("fn_selfeval_claim_upload", {
    p_session_id: sessionId,
    p_profile_id: userId,
    p_cap: cap,
  });
  if (error) throw new Error("fn_selfeval_claim_upload 호출 실패");
  const kind = (data as { kind?: unknown } | null)?.kind;
  if (kind === "claimed") return true;
  if (kind === "limit") return false;
  throw new Error(
    `fn_selfeval_claim_upload 응답을 읽을 수 없음: ${String(kind)}`,
  );
}

export function manualLogsStore(db: Db): ManualStore {
  return {
    async list(sessionId) {
      return must(
        await db
          .from("selfeval_manual_logs")
          .select(COLUMNS)
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true }),
        "selfeval_manual_logs 조회 실패",
      ) as MemoRow[];
    },
    async insert(rows) {
      return must(
        await db.from("selfeval_manual_logs").insert(rows).select(COLUMNS),
        "selfeval_manual_logs 저장 실패",
      ) as MemoRow[];
    },
    async get(sessionId, memoId) {
      return must(
        await db
          .from("selfeval_manual_logs")
          .select(COLUMNS)
          .eq("session_id", sessionId)
          .eq("id", memoId)
          .maybeSingle(),
        "selfeval_manual_logs 조회 실패",
      ) as MemoRow | null;
    },
    async update(sessionId, memoId, patch) {
      return must(
        await db
          .from("selfeval_manual_logs")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("session_id", sessionId)
          .eq("id", memoId)
          .select(COLUMNS)
          .maybeSingle(),
        "selfeval_manual_logs 수정 실패",
      ) as MemoRow | null;
    },
    async remove(sessionId, memoId) {
      const rows = must(
        await db
          .from("selfeval_manual_logs")
          .delete()
          .eq("session_id", sessionId)
          .eq("id", memoId)
          .select("id"),
        "selfeval_manual_logs 삭제 실패",
      ) as unknown[];
      return rows.length > 0;
    },
  };
}
