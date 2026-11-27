// /api/admin/inquiry-sessions 아래 심화탐구 세션 운영 조회 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/inquiry-sessions", inquirySessions) 로 붙인다.
// 요청 검증과 응답 모양은 shared/inquiry-session/contract.ts 를 따른다. 권한: 메뉴 inquirySessions 의 view.
//
// GET /?status=&q=&page=&pageSize=: 상태 필터, 학생 이름 또는 이메일 검색, 최근 활동순, 서버 페이지네이션.
//   검색은 profiles 를 먼저 찾아 profile_id 로 거른다(2단계 조회). 이름과 이메일은 페이지에 담긴 세션의 프로필만 붙이고,
//   선택 주제 제목은 inquiry_topics 에서 한 번에 가져온다. 200 { items, total, page, pageSize }, 값 규칙 위반은 400 INVALID_QUERY.
// GET /:id: 세션 한 건. 목록 항목과 같은 모양이다. 없으면 404 NOT_FOUND.
// 판단과 변환은 api/_lib/inquiry/ops/list.ts, 프로필과 주제 제목 붙이기는 sessionItems.ts.

import {
  INQUIRY_SESSION_ERROR,
  type InquirySession,
  type InquirySessionsPage,
  sessionIdParams,
  sessionListQuery,
} from "../../../shared/inquiry-session/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import {
  methodNotAllowed,
  notFound,
  ProblemError,
} from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import type { SessionListRow } from "../../_lib/inquiry/ops/list.js";
import { escapeIlike, parseListQuery } from "../../_lib/inquiry/ops/list.js";
import {
  SESSION_COLUMNS,
  toSessionItems,
} from "../../_lib/inquiry/ops/sessionItems.js";

// 검색어에 맞는 프로필 id 상한. 넘으면 검색어를 좁혀 달라는 뜻이라 초과분은 버린다.
const MAX_SEARCH_PROFILES = 500;

const listGuard = admin({
  permission: { key: "inquirySessions" },
  unhandledMessage: "심화탐구 세션 조회에 실패했습니다.",
  logLabel: "admin/inquiry-sessions",
});
const byIdGuard = admin({
  permission: { key: "inquirySessions" },
  unhandledMessage: "심화탐구 세션 조회에 실패했습니다.",
  logLabel: "admin/inquiry-sessions/id",
});

export const inquirySessions = adminFactory
  .createApp()
  .get("/", listGuard, validate("query", sessionListQuery), async (c) => {
    const parsed = parseListQuery(c.req.valid("query"));
    if (!parsed.ok) {
      throw new ProblemError(
        400,
        parsed.reason,
        INQUIRY_SESSION_ERROR.INVALID_QUERY,
      );
    }
    const { status, q, page, pageSize } = parsed.query;
    const db = c.var.supabaseAdmin;

    let profileIds: string[] | null = null;
    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      const { data, error } = await db
        .from("profiles")
        .select("id")
        .or(`name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(MAX_SEARCH_PROFILES);
      if (error) throw new Error(`profiles 검색 실패: ${error.message}`);
      profileIds = (data ?? []).map((r: { id: string }) => r.id);
      if (profileIds.length === 0) {
        return c.json({
          items: [],
          total: 0,
          page,
          pageSize,
        } satisfies InquirySessionsPage);
      }
    }

    let query = db
      .from("inquiry_sessions")
      .select(SESSION_COLUMNS, { count: "exact" });
    if (status) query = query.eq("status", status);
    if (profileIds) query = query.in("profile_id", profileIds);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order("last_activity_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`inquiry_sessions 조회 실패: ${error.message}`);

    return c.json({
      items: await toSessionItems(db, (data ?? []) as SessionListRow[]),
      total: count ?? 0,
      page,
      pageSize,
    } satisfies InquirySessionsPage);
  })
  .all("/", methodNotAllowed("GET"))
  .get("/:id", byIdGuard, validate("param", sessionIdParams), async (c) => {
    const db = c.var.supabaseAdmin;
    const { data, error } = await db
      .from("inquiry_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", c.req.valid("param").id)
      .maybeSingle();
    if (error) throw new Error(`inquiry_sessions 조회 실패: ${error.message}`);
    if (!data) throw notFound("세션");
    const [item] = await toSessionItems(db, [data as SessionListRow]);
    return c.json(item satisfies InquirySession | undefined);
  })
  .all("/:id", methodNotAllowed("GET"));
