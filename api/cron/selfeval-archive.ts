// GET /api/cron/selfeval-archive, 미완 자기평가서 세션 보관과 차감 되돌림 (매일 04:10 KST)
//
// 1) 마지막 활동 후 SESSION_EXPIRY_DAYS(90일)가 지난 draft, in_progress 세션을 archived 로 닫고
//    step_state.terminal 에 { reason: "expired", at, step: null } 을 남긴다(명세 No.18).
//    종결은 fn_selfeval_terminate_session 이 세션 행 잠금 아래에서 한다(steps 보존).
// 2) 종결 사유가 있고 차감 원장이 있으나 아직 되돌리지 않은 archived 세션 20건에
//    reverse_selfeval_credit 를 건다. 파기(discarded)는 학생의 선택이라 되돌리지 않는다(계획서 §2 8).
//
// 시각: 04:10 KST = 19:10 UTC (vercel.json crons "10 19 * * *").

import { defineHandler } from "../_lib/handler.js";
import { reverseCredit, terminateSession } from "../_lib/selfeval/db.js";
import { SESSION_EXPIRY_DAYS } from "../_lib/selfeval/types.js";

export const config = { runtime: "nodejs" };

const REVERSE_BATCH = 20;
const REVERSE_REASON = "selfeval:terminal-reverse";

export default defineHandler({
  methods: ["GET"],
  auth: "cron",
  errorShape: "detail",
  authFailureMessage: "Unauthorized",
  unhandledMessage: "자기평가서 미완 세션 보관 처리 중 오류가 발생했습니다.",
  logLabel: "cron/selfeval-archive",
  handler: async (_req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    const cutoff = new Date(
      Date.now() - SESSION_EXPIRY_DAYS * 86_400_000,
    ).toISOString();

    const { data: stale, error } = await db
      .from("selfeval_sessions")
      .select("id, profile_id")
      .in("status", ["draft", "in_progress"])
      .lt("last_activity_at", cutoff);
    if (error) throw error;

    let archived = 0;
    for (const row of (stale ?? []) as { id: string; profile_id: string }[]) {
      try {
        const result = await terminateSession(
          db,
          row.profile_id,
          row.id,
          null,
          "expired",
        );
        if (result.ok) archived += 1;
      } catch (e) {
        console.error(`cron/selfeval-archive 보관 실패 session=${row.id}`, e);
      }
    }

    // 파기 세션은 terminal.reason 이 discarded 라 이 조건에서 빠진다. 종결 사유가 없는 행도
    // json 경로가 null 이라 neq 에서 걸러진다.
    const { data: pending, error: pendingError } = await db
      .from("selfeval_sessions")
      .select("id, profile_id")
      .eq("status", "archived")
      .not("ledger_id", "is", null)
      .is("ledger_reversed_at", null)
      .neq("step_state->terminal->>reason", "discarded")
      .order("last_activity_at", { ascending: true })
      .limit(REVERSE_BATCH);
    if (pendingError) throw pendingError;

    let reversed = 0;
    for (const row of (pending ?? []) as { id: string; profile_id: string }[]) {
      try {
        await reverseCredit(db, row.profile_id, row.id, REVERSE_REASON);
        reversed += 1;
      } catch (e) {
        console.error(`cron/selfeval-archive 되돌림 실패 session=${row.id}`, e);
      }
    }

    console.log(
      `cron/selfeval-archive cutoff=${cutoff} 보관 ${archived}건 되돌림 ${reversed}건`,
    );
    res.status(200).json({ ok: true, archived, reversed });
  },
});
