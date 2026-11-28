// GET /api/selfeval/reports
// Authorization: Bearer <access_token>
//
// 자기평가서 진입과 조회 엔드포인트(계획서 §2 10~13). 쿼리로 모드를 가른다. 요청, 응답 계약은 shared/selfeval/reports.ts, session.ts 다.
//
//   ① 진입과 목록 `GET /api/selfeval/reports`
//      200 { entry, sessions[] }
//      entry   { quota, allowed, activityCount, openSession|null, growth|null, profile|null,
//                replyResent, academicYearDefault }
//              openSession { id, status, currentStep, route, area, subject, activityName, lastActivityAt }
//              growth      { reportId, issuedAt, stale, banner, planItems[] }
//              진입 때 성장설계 회신이 남은 완료 세션을 다시 보내고 그 건수를 replyResent 에 싣는다.
//      sessions[] { id, status, currentStep, academicYear, semester, area, subject, activityName,
//                   score, completedAt, lastActivityAt, expired, discarded, terminal|null }
//              last_activity_at 내림차순. 큰 jsonb 는 읽지 않는다.
//   ② 상세 `GET /api/selfeval/reports?sessionId=<uuid>`
//      200 { session, activities[], memos[], reports:{generation,edited,verification,final},
//            regenerationsLeft, current }
//
//   400 VALIDATION_FAILED   (sessionId 가 uuid 가 아님)
//   404 SESSION_NOT_FOUND   (없는 세션과 남의 세션을 같은 응답으로 묶는다)
//
// 조립 규칙은 api/_lib/selfeval/view.ts 의 순수 함수가 가지고, 이 파일은 DB 읽기와 응답을 잇는다.

import type { Context } from "hono";
import type { z } from "zod";
import { SELFEVAL_ERROR } from "../../../shared/selfeval/contract.js";
import type { entryResponseSchema } from "../../../shared/selfeval/reports.js";
import { reportsQuery } from "../../../shared/selfeval/reports.js";
import type { sessionDetailResponseSchema } from "../../../shared/selfeval/session.js";
import { completePlanItemFromProgram } from "../../_lib/growth/plan/complete.js";
import { type UserEnv, userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  readSelfevalAccess,
  readSelfevalQuota,
  selfevalProblem,
} from "../../_lib/selfeval/access.js";
import {
  countActivities,
  type Db,
  listSessions,
  loadGrowthSnapshot,
  loadLatestReportsByType,
  loadMemberTimeZone,
  loadReports,
  loadSession,
  loadSessionActivities,
  loadSessionsWithReplyPending,
  loadStudentProfile,
} from "../../_lib/selfeval/db.js";
import { loadIncludedMemos } from "../../_lib/selfeval/evidenceDb.js";
import { resendPendingReplies } from "../../_lib/selfeval/reply.js";
import {
  detailBody,
  entryBody,
  latestScores,
  listItem,
} from "../../_lib/selfeval/view.js";

const guard = user({
  unhandledMessage: "자기평가서를 불러오지 못했습니다.",
  logLabel: "selfeval/reports",
  headers: { "Cache-Control": "no-store" },
});

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

async function list(c: Context<UserEnv>, db: Db, userId: string) {
  const now = new Date();
  const replyResent = await resendReplies(db, userId, now);
  const [quota, access, activityCount, sessions, growth, profile, timeZone] =
    await Promise.all([
      readSelfevalQuota(db, userId),
      readSelfevalAccess(db, userId),
      countActivities(db, userId),
      listSessions(db, userId),
      loadGrowthSnapshot(db, userId),
      loadStudentProfile(db, userId),
      loadMemberTimeZone(db, userId),
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
  return c.json({
    entry: entryBody({
      quota,
      allowed: access.allowed,
      tenantReason: access.tenantReason,
      capReason: quota.capReason,
      activityCount,
      open,
      growth,
      now,
      profile,
      replyResent,
      timeZone,
    }),
    sessions: sessions.map((s) => listItem(s, scores.get(s.id) ?? null)),
  } satisfies z.output<typeof entryResponseSchema>);
}

async function detail(
  c: Context<UserEnv>,
  db: Db,
  userId: string,
  sessionId: string,
) {
  const session = await loadSession(db, userId, sessionId);
  if (!session) {
    throw selfevalProblem(
      404,
      SELFEVAL_ERROR.SESSION_NOT_FOUND,
      "자기평가서 세션을 찾을 수 없어요.",
    );
  }
  const [activities, reports, memos] = await Promise.all([
    loadSessionActivities(db, userId, sessionId),
    loadReports(db, userId, sessionId),
    loadIncludedMemos(db, sessionId),
  ]);
  return c.json(
    detailBody(session, activities, reports, memos) satisfies z.output<
      typeof sessionDetailResponseSchema
    >,
  );
}

export const reports = userFactory
  .createApp()
  .get("/", guard, validate("query", reportsQuery), async (c) => {
    const { sessionId } = c.req.valid("query");
    const { supabaseAdmin: db, user: me } = c.var;
    if (sessionId === undefined) return list(c, db, me.id);
    return detail(c, db, me.id, sessionId);
  })
  .all("/", methodNotAllowed("GET"));
