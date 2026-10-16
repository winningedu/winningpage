// GET /api/selfeval/reports
// Authorization: Bearer <access_token>
//
// 자기평가서 진입과 조회 엔드포인트(계획서 §2 10~13). 쿼리로 모드를 가른다.
//
//   ① 진입과 목록 `GET /api/selfeval/reports`
//      200 { ok, entry, sessions[] }
//      entry   { quota, allowed, activityCount, openSession|null, growth|null, profile|null,
//                replyResent, academicYearDefault }
//              openSession { id, status, currentStep, route, area, subject, activityName, lastActivityAt }
//              growth      { reportId, issuedAt, stale, banner, planItems[] }
//              진입 때 성장설계 회신이 남은 완료 세션을 다시 보내고 그 건수를 replyResent 에 싣는다.
//      sessions[] { id, status, currentStep, academicYear, semester, area, subject, activityName,
//                   score, completedAt, lastActivityAt, expired, discarded, terminal|null }
//              last_activity_at 내림차순. 큰 jsonb 는 읽지 않는다.
//   ② 상세 `GET /api/selfeval/reports?sessionId=<uuid>`
//      200 { ok, session, activities[], reports:{generation,edited,verification,final},
//            regenerationsLeft, current }
//
//   400 INVALID_QUERY
//   404 SESSION_NOT_FOUND   (없는 세션과 남의 세션을 같은 응답으로 묶는다)
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 조립 규칙은 api/_lib/selfeval/view.ts 의
// 순수 함수로 검증한다.

import type { VercelResponse } from "@vercel/node";
import { completePlanItemFromProgram } from "../_lib/growth/plan/complete.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import {
  fail,
  hasSelfevalAccess,
  readSelfevalQuota,
} from "../_lib/selfeval/access.js";
import {
  countActivities,
  type Db,
  listSessions,
  loadGrowthSnapshot,
  loadLatestReportsByType,
  loadReports,
  loadSession,
  loadSessionActivities,
  loadSessionsWithReplyPending,
  loadStudentProfile,
} from "../_lib/selfeval/db.js";
import { resendPendingReplies } from "../_lib/selfeval/reply.js";
import {
  detailBody,
  entryBody,
  latestScores,
  listItem,
  parseReportsQuery,
} from "../_lib/selfeval/view.js";

/** 회신 재전송 실패가 진입을 막지 않게 삼키고 로그만 남긴다(명세 No.75). */
async function resendReplies(
  db: Db,
  userId: string,
  now: Date,
): Promise<number> {
  try {
    const pending = await loadSessionsWithReplyPending(db, userId);
    const { resent } = await resendPendingReplies(db, userId, pending, {
      complete: completePlanItemFromProgram,
      now,
    });
    return resent;
  } catch (e) {
    console.error("selfeval/reports 회신 재전송 실패(무시):", e);
    return 0;
  }
}

async function handleList(res: VercelResponse, db: Db, userId: string) {
  const now = new Date();
  const replyResent = await resendReplies(db, userId, now);
  const [quota, allowed, activityCount, sessions, growth, profile] =
    await Promise.all([
      readSelfevalQuota(db, userId),
      hasSelfevalAccess(db, userId),
      countActivities(db, userId),
      listSessions(db, userId),
      loadGrowthSnapshot(db, userId),
      loadStudentProfile(db, userId),
    ]);
  const scores = latestScores(
    await loadLatestReportsByType(
      db,
      userId,
      sessions.map((s) => s.id),
    ),
  );
  const open =
    sessions.find((s) => s.status === "draft" || s.status === "in_progress") ??
    null;
  res.status(200).json({
    ok: true,
    entry: entryBody({
      quota,
      allowed,
      activityCount,
      open,
      growth,
      now,
      profile,
      replyResent,
    }),
    sessions: sessions.map((s) => listItem(s, scores.get(s.id) ?? null)),
  });
}

async function handleDetail(
  res: VercelResponse,
  db: Db,
  userId: string,
  sessionId: string,
) {
  const session = await loadSession(db, userId, sessionId);
  if (!session) {
    fail(res, 404, "SESSION_NOT_FOUND", "자기평가서 세션을 찾을 수 없어요.");
    return;
  }
  const [activities, reports] = await Promise.all([
    loadSessionActivities(db, userId, sessionId),
    loadReports(db, userId, sessionId),
  ]);
  res
    .status(200)
    .json({ ok: true, ...detailBody(session, activities, reports) });
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "자기평가서를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "selfeval/reports",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const query = parseReportsQuery(req.query ?? {});
    if (!query.ok) {
      fail(res, 400, "INVALID_QUERY", query.reason);
      return;
    }
    if (query.sessionId === undefined) {
      await handleList(res, ctx.supabaseAdmin, userId);
      return;
    }
    await handleDetail(res, ctx.supabaseAdmin, userId, query.sessionId);
  },
});

export const config = { runtime: "nodejs", maxDuration: 30 };
