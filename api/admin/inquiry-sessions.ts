// GET /api/admin/inquiry-sessions?status=&q=&page=&pageSize=
// Authorization: Bearer <supabase access token>   (관리자)
//
// 심화탐구 세션 운영 조회. 상태 필터, 학생 이름 또는 이메일 검색, 최근 활동순, 서버 페이지네이션.
// 검색은 profiles 를 먼저 찾아 profile_id 로 거른다(2단계 조회). 응답의 이름과 이메일은
// 페이지에 담긴 세션의 프로필만 한 번 더 조회해 붙이고, 선택 주제 제목은 inquiry_topics 에서 한 번에 가져온다.
//
// 응답 200 { ok, items, total, page, pageSize }
//   items[]: id, profileId, studentName, email, status, currentStep, subject, topicTitle,
//            completedAt, lastActivityAt, ledgerId, ledgerReversedAt, terminal, generation,
//            evaluationCount, topicRoundCount
// 오류(coded): 400 INVALID_QUERY, 401/403 인증, 405 METHOD_NOT_ALLOWED, 500 INTERNAL
//
// 핸들러 본문은 DB 에 묶여 있어 단위 테스트하지 않는다. 판단과 변환은 api/_lib/inquiry/ops/list.ts.

import type {
  ProfileSummary,
  SessionListRow,
} from "../_lib/inquiry/ops/list.js";
import {
  escapeIlike,
  parseListQuery,
  toSessionListItem,
} from "../_lib/inquiry/ops/list.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

const SESSION_COLUMNS =
  "id, profile_id, status, current_step, subject, selected_topic_id, completed_at, last_activity_at, ledger_id, ledger_reversed_at, generation_state, evaluation_count, topic_round_count";

// 검색어에 맞는 프로필 id 상한. 넘으면 검색어를 좁혀 달라는 뜻이라 초과분은 버린다.
const MAX_SEARCH_PROFILES = 500;

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "심화탐구 세션 조회에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "admin/inquiry-sessions",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const parsed = parseListQuery(req.query);
    if (!parsed.ok) {
      sendError(res, "coded", 400, parsed.reason, "INVALID_QUERY", {
        ok: false,
      });
      return;
    }
    const { status, q, page, pageSize } = parsed.query;
    const db = ctx.supabaseAdmin;

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
        res.status(200).json({ ok: true, items: [], total: 0, page, pageSize });
        return;
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

    const rows = (data ?? []) as SessionListRow[];
    const ids = [...new Set(rows.map((r) => r.profile_id))];
    const profiles = new Map<string, ProfileSummary>();
    if (ids.length > 0) {
      const { data: pData, error: pError } = await db
        .from("profiles")
        .select("id, name, email")
        .in("id", ids);
      if (pError) throw new Error(`profiles 조회 실패: ${pError.message}`);
      for (const p of (pData ?? []) as {
        id: string;
        name: string | null;
        email: string | null;
      }[])
        profiles.set(p.id, { name: p.name, email: p.email });
    }

    const topicIds = [
      ...new Set(
        rows.map((r) => r.selected_topic_id).filter((v): v is string => !!v),
      ),
    ];
    const titles = new Map<string, string>();
    if (topicIds.length > 0) {
      const { data: tData, error: tError } = await db
        .from("inquiry_topics")
        .select("id, detail")
        .in("id", topicIds);
      if (tError)
        throw new Error(`inquiry_topics 조회 실패: ${tError.message}`);
      for (const t of (tData ?? []) as { id: string; detail: unknown }[]) {
        const title = (t.detail as { title?: unknown } | null)?.title;
        if (typeof title === "string") titles.set(t.id, title);
      }
    }

    res.status(200).json({
      ok: true,
      items: rows.map((r) =>
        toSessionListItem(
          r,
          profiles.get(r.profile_id),
          r.selected_topic_id
            ? (titles.get(r.selected_topic_id) ?? null)
            : null,
        ),
      ),
      total: count ?? 0,
      page,
      pageSize,
    });
  },
});

export const config = { runtime: "nodejs" };
