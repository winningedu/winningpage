// GET /api/cron/inquiry-archive, 미완 심화탐구 세션 보관 처리 (매일 04:10 KST)
//
// 마지막 활동 후 SESSION_EXPIRY_DAYS(90일)가 지난 draft / in_progress 세션을 archived 로 바꾼다
// (명세 No.26, 개발계획 부록 B 5번). 완료된 세션은 건드리지 않는다.
// 만료 세션의 차감은 되돌리지 않는다. 되돌림은 생성 실패 종결에만 쓴다.
//
// 시각: 04:10 KST = 19:10 UTC (vercel.json crons "10 19 * * *").

import { defineHandler } from "../_lib/handler.js";
import { archiveExpiredSessions } from "../_lib/inquiry/evaluateDb.js";
import { expiryCutoffIso } from "../_lib/inquiry/session.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "cron",
  errorShape: "detail",
  authFailureMessage: "Unauthorized",
  unhandledMessage: "심화탐구 미완 세션 보관 처리 중 오류가 발생했습니다.",
  logLabel: "cron/inquiry-archive",
  handler: async (_req, res, ctx) => {
    const cutoff = expiryCutoffIso(new Date().toISOString());
    const ids = await archiveExpiredSessions(ctx.supabaseAdmin, cutoff);
    console.log(`cron/inquiry-archive cutoff=${cutoff} 보관 ${ids.length}건`);
    res.status(200).json({ ok: true, archived: ids.length, ids });
  },
});
