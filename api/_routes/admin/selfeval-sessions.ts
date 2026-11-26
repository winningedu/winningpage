// /api/admin/selfeval-sessions 아래 자기평가서 세션 운영 조회 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/selfeval-sessions", selfevalSessions) 로 붙인다.
// 요청 검증과 응답 모양은 shared/selfeval-session/contract.ts 를 따른다. 권한: 메뉴 selfevalSessions 의 view.
//
// GET /?status=&q=&page=&pageSize=: 상태 필터, 학생 이름 또는 이메일 또는 과목 검색, 최근 활동순, 서버 페이지네이션.
//   검색은 profiles 를 먼저 찾아 profile_id 또는 과목 일치로 거른다. 200 { items, total, page, pageSize }, 값 규칙 위반은 400 INVALID_QUERY.
// GET /:id: 세션 상세 { session, studentName, email, terminal, progress, activities, reports }. 없으면 404 SESSION_NOT_FOUND.
// 판단과 변환은 api/_lib/selfeval/ops/list.ts.

import {
  SELFEVAL_SESSION_ERROR,
  type SelfevalSessionDetail,
  type SelfevalSessionsPage,
  sessionIdParams,
  sessionListQuery,
} from "../../../shared/selfeval-session/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import type {
  DetailActivityRow,
  DetailReportRow,
  SessionListRow,
} from "../../_lib/selfeval/ops/list.js";
import {
  buildSearchFilter,
  escapeIlike,
  parseSessionsQuery,
  toSessionDetail,
  toSessionListItem,
} from "../../_lib/selfeval/ops/list.js";
import { loadProfiles } from "../../_lib/selfeval/ops/profiles.js";

const LIST_COLUMNS =
  "id, profile_id, status, current_step, academic_year, semester, area, subject, activity_name, regenerate_count, ledger_id, ledger_reversed_at, step_state, last_activity_at, completed_at";

// 검색어에 맞는 프로필 id 상한. 넘으면 검색어를 좁혀 달라는 뜻이라 초과분은 버린다.
const MAX_SEARCH_PROFILES = 500;

const listGuard = admin({
  permission: { key: "selfevalSessions" },
  unhandledMessage: "자기평가서 세션 조회에 실패했습니다.",
  logLabel: "admin/selfeval-sessions",
});
const byIdGuard = admin({
  permission: { key: "selfevalSessions" },
  unhandledMessage: "자기평가서 세션 조회에 실패했습니다.",
  logLabel: "admin/selfeval-sessions/id",
});

export const selfevalSessions = adminFactory
  .createApp()
  .get("/", listGuard, validate("query", sessionListQuery), async (c) => {
    const parsed = parseSessionsQuery(c.req.valid("query"));
    if (!parsed.ok) {
      throw new ProblemError(
        400,
        parsed.reason,
        SELFEVAL_SESSION_ERROR.INVALID_QUERY,
      );
    }
    const db = c.var.supabaseAdmin;

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
    const profiles = await loadProfiles(db, [
      ...new Set(rows.map((r) => r.profile_id)),
    ]);

    return c.json({
      items: rows.map((r) => toSessionListItem(r, profiles.get(r.profile_id))),
      total: count ?? 0,
      page,
      pageSize,
    } satisfies SelfevalSessionsPage);
  })
  .all("/", methodNotAllowed("GET"))
  .get("/:id", byIdGuard, validate("param", sessionIdParams), async (c) => {
    const sessionId = c.req.valid("param").id;
    const db = c.var.supabaseAdmin;
    const { data: session, error } = await db
      .from("selfeval_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error(`selfeval_sessions 조회 실패: ${error.message}`);
    if (!session) {
      throw new ProblemError(
        404,
        "세션을 찾을 수 없습니다.",
        SELFEVAL_SESSION_ERROR.SESSION_NOT_FOUND,
      );
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
    return c.json(
      toSessionDetail(
        session as SessionListRow & Record<string, unknown>,
        profiles.get(session.profile_id),
        (activities.data ?? []) as DetailActivityRow[],
        (reports.data ?? []) as DetailReportRow[],
      ) satisfies SelfevalSessionDetail,
    );
  })
  .all("/:id", methodNotAllowed("GET"));
