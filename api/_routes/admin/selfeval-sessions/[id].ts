// GET /api/admin/selfeval-sessions/:id   (세션 상세)
// Authorization: Bearer <supabase access token>   (관리자)
// 권한: 메뉴 selfevalSessions(GET view). id 는 경로 구간이고 dispatch 가 req.query.id 에 담는다(uuid 가 아니면 400).
//
// 응답 200 { session, studentName, email, terminal, progress, activities, reports }
// 오류(problem): 400 VALIDATION_FAILED, 404 SESSION_NOT_FOUND, 401/403 인증, 405, 500
//
// 변환은 api/_lib/selfeval/ops/list.ts.

import { z } from "zod";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";
import type {
  DetailActivityRow,
  DetailReportRow,
  SessionListRow,
} from "../../../_lib/selfeval/ops/list.js";
import { toSessionDetail } from "../../../_lib/selfeval/ops/list.js";
import { loadProfiles } from "../../../_lib/selfeval/ops/profiles.js";

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "selfevalSessions" },
  unhandledMessage: "자기평가서 세션 조회에 실패했습니다.",
  logLabel: "admin/selfeval-sessions/id",
  headers: { "Cache-Control": "no-store" },
  query: z.object({ id: z.uuid() }),
  handler: async (_req, res, ctx) => {
    const { id: sessionId } = ctx.query;
    const db = ctx.supabaseAdmin;
    const { data: session, error } = await db
      .from("selfeval_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error(`selfeval_sessions 조회 실패: ${error.message}`);
    if (!session) {
      sendError(
        res,
        "problem",
        404,
        "세션을 찾을 수 없습니다.",
        "SESSION_NOT_FOUND",
      );
      return;
    }
    const [activities, reports, profiles] = await Promise.all([
      db
        .from("selfeval_session_activities")
        .select("activity_record_id, role, fit_score, analysis_source")
        .eq("session_id", sessionId)
        .order("role", { ascending: true }),
      db
        .from("selfeval_reports")
        .select("id, report_type, revision, score, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false }),
      loadProfiles(db, [session.profile_id]),
    ]);
    if (activities.error)
      throw new Error(`선택 활동 조회 실패: ${activities.error.message}`);
    if (reports.error)
      throw new Error(`리포트 조회 실패: ${reports.error.message}`);
    res
      .status(200)
      .json(
        toSessionDetail(
          session as SessionListRow & Record<string, unknown>,
          profiles.get(session.profile_id),
          (activities.data ?? []) as DetailActivityRow[],
          (reports.data ?? []) as DetailReportRow[],
        ),
      );
  },
});

export const config = { runtime: "nodejs" };
