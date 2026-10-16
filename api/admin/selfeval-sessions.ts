// GET /api/admin/selfeval-sessions?status=&q=&page=&pageSize=   (목록)
// GET /api/admin/selfeval-sessions?sessionId=                   (상세)
// Authorization: Bearer <supabase access token>   (관리자)
//
// 자기평가서 세션 운영 조회. 상태 필터, 학생 이름 또는 이메일 또는 과목 검색, 최근 활동순,
// 서버 페이지네이션. 검색은 profiles 를 먼저 찾아 profile_id 또는 과목 일치로 거른다.
//
// 목록 응답 200 { ok, items, total, page, pageSize }
//   items[]: id, profileId, studentName, email, status, currentStep, academicYear, semester, area,
//            subject, activityName, regenerateCount, ledgerId, ledgerReversedAt, terminal,
//            progress, lastActivityAt, completedAt
// 상세 응답 200 { ok, session, studentName, email, terminal, progress, activities, reports }
// 오류(coded): 400 INVALID_QUERY, 404 SESSION_NOT_FOUND, 401/403 인증, 405, 500 INTERNAL
//
// 핸들러 본문은 DB 에 묶여 있어 단위 테스트하지 않는다. 판단과 변환은 api/_lib/selfeval/ops/list.ts.

import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import type {
  DetailActivityRow,
  DetailReportRow,
  ProfileSummary,
  SessionListRow,
} from "../_lib/selfeval/ops/list.js";
import {
  buildSearchFilter,
  escapeIlike,
  parseSessionsQuery,
  toSessionDetail,
  toSessionListItem,
} from "../_lib/selfeval/ops/list.js";

const LIST_COLUMNS =
  "id, profile_id, status, current_step, academic_year, semester, area, subject, activity_name, regenerate_count, ledger_id, ledger_reversed_at, step_state, last_activity_at, completed_at";

// 검색어에 맞는 프로필 id 상한. 넘으면 검색어를 좁혀 달라는 뜻이라 초과분은 버린다.
const MAX_SEARCH_PROFILES = 500;

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "자기평가서 세션 조회에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "admin/selfeval-sessions",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const parsed = parseSessionsQuery(req.query);
    if (!parsed.ok) {
      sendError(res, "coded", 400, parsed.reason, "INVALID_QUERY", {
        ok: false,
      });
      return;
    }
    const db = ctx.supabaseAdmin;

    const loadProfiles = async (ids: string[]) => {
      const profiles = new Map<string, ProfileSummary>();
      if (ids.length === 0) return profiles;
      const { data, error } = await db
        .from("profiles")
        .select("id, name, email")
        .in("id", ids);
      if (error) throw new Error(`profiles 조회 실패: ${error.message}`);
      for (const p of (data ?? []) as {
        id: string;
        name: string | null;
        email: string | null;
      }[])
        profiles.set(p.id, { name: p.name, email: p.email });
      return profiles;
    };

    if (parsed.query.kind === "detail") {
      const { sessionId } = parsed.query;
      const { data: session, error } = await db
        .from("selfeval_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (error)
        throw new Error(`selfeval_sessions 조회 실패: ${error.message}`);
      if (!session) {
        sendError(
          res,
          "coded",
          404,
          "세션을 찾을 수 없습니다.",
          "SESSION_NOT_FOUND",
          { ok: false },
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
        loadProfiles([session.profile_id]),
      ]);
      if (activities.error)
        throw new Error(`선택 활동 조회 실패: ${activities.error.message}`);
      if (reports.error)
        throw new Error(`리포트 조회 실패: ${reports.error.message}`);
      res.status(200).json({
        ok: true,
        ...toSessionDetail(
          session as SessionListRow & Record<string, unknown>,
          profiles.get(session.profile_id),
          (activities.data ?? []) as DetailActivityRow[],
          (reports.data ?? []) as DetailReportRow[],
        ),
      });
      return;
    }

    const { status, q, page, pageSize } = parsed.query;
    let searchFilter: string | null = null;
    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      const { data, error } = await db
        .from("profiles")
        .select("id")
        .or(`name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(MAX_SEARCH_PROFILES);
      if (error) throw new Error(`profiles 검색 실패: ${error.message}`);
      searchFilter = buildSearchFilter(
        q,
        (data ?? []).map((r: { id: string }) => r.id),
      );
    }

    let query = db
      .from("selfeval_sessions")
      .select(LIST_COLUMNS, { count: "exact" });
    if (status) query = query.eq("status", status);
    if (searchFilter) query = query.or(searchFilter);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order("last_activity_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`selfeval_sessions 조회 실패: ${error.message}`);

    const rows = (data ?? []) as SessionListRow[];
    const profiles = await loadProfiles([
      ...new Set(rows.map((r) => r.profile_id)),
    ]);

    res.status(200).json({
      ok: true,
      items: rows.map((r) => toSessionListItem(r, profiles.get(r.profile_id))),
      total: count ?? 0,
      page,
      pageSize,
    });
  },
});

export const config = { runtime: "nodejs" };
