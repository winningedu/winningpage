// GET /api/admin/selfeval-sessions?status=&q=&page=&pageSize=   (목록)
// 상세는 GET /api/admin/selfeval-sessions/:id (selfeval-sessions/[id].ts).
// Authorization: Bearer <supabase access token>   (관리자)
// 권한: 메뉴 selfevalSessions(GET view).
//
// 자기평가서 세션 운영 조회. 상태 필터, 학생 이름 또는 이메일 또는 과목 검색, 최근 활동순,
// 서버 페이지네이션. 검색은 profiles 를 먼저 찾아 profile_id 또는 과목 일치로 거른다.
//
// 응답 200 { items, total, page, pageSize }
//   items[]: id, profileId, studentName, email, status, currentStep, academicYear, semester, area,
//            subject, activityName, regenerateCount, ledgerId, ledgerReversedAt, terminal,
//            progress, lastActivityAt, completedAt
// 오류(problem): 400 INVALID_QUERY, 400 VALIDATION_FAILED, 401/403 인증, 405, 500
//
// 판단과 변환은 api/_lib/selfeval/ops/list.ts.

import { z } from "zod";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import type { SessionListRow } from "../../_lib/selfeval/ops/list.js";
import {
  buildSearchFilter,
  escapeIlike,
  parseSessionsQuery,
  toSessionListItem,
} from "../../_lib/selfeval/ops/list.js";
import { loadProfiles } from "../../_lib/selfeval/ops/profiles.js";

const LIST_COLUMNS =
  "id, profile_id, status, current_step, academic_year, semester, area, subject, activity_name, regenerate_count, ledger_id, ledger_reversed_at, step_state, last_activity_at, completed_at";

// 검색어에 맞는 프로필 id 상한. 넘으면 검색어를 좁혀 달라는 뜻이라 초과분은 버린다.
const MAX_SEARCH_PROFILES = 500;

// 값의 규칙(허용 상태, 페이지 범위)은 parseSessionsQuery 가 맡는다. 여기는 모양만 본다.
const param = z.union([z.string(), z.array(z.string())]).optional();

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "selfevalSessions" },
  unhandledMessage: "자기평가서 세션 조회에 실패했습니다.",
  logLabel: "admin/selfeval-sessions",
  headers: { "Cache-Control": "no-store" },
  query: z.object({ status: param, q: param, page: param, pageSize: param }),
  handler: async (_req, res, ctx) => {
    const parsed = parseSessionsQuery(ctx.query);
    if (!parsed.ok) {
      sendError(res, "problem", 400, parsed.reason, "INVALID_QUERY");
      return;
    }
    const db = ctx.supabaseAdmin;

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

    res.status(200).json({
      items: rows.map((r) => toSessionListItem(r, profiles.get(r.profile_id))),
      total: count ?? 0,
      page,
      pageSize,
    });
  },
});

export const config = { runtime: "nodejs" };
