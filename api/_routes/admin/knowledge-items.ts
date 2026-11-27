// /api/admin/knowledge-items 아래 지식 항목 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/knowledge-items", knowledgeItems) 로 붙인다.
// 요청 검증과 응답 모양은 shared/knowledge-item/contract.ts 를 따른다.
// 권한: 메뉴 knowledgeEvals 의 view(기준 문제집 화면이 쓰는 제목 읽기만 연다). 다른 열(embedding, content 등)은 돌려주지 않는다.

import {
  TITLES_SEARCH_LIMIT,
  type TitlesResponse,
  titlesQuery,
} from "../../../shared/knowledge-item/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

const TABLE = "winning_assessment_knowledge_items";

/** ilike 의 \ % _ 를 글자 그대로 찾게 한다. */
function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function toItems(
  rows: { id: string; title: string | null }[] | null,
): TitlesResponse["items"] {
  return (rows ?? []).map((row) => ({ id: row.id, title: row.title ?? "" }));
}

const titlesGuard = admin({
  permission: { key: "knowledgeEvals" },
  unhandledMessage: "자료 제목을 읽지 못했어요.",
  logLabel: "admin/knowledge-items/titles",
});

export const knowledgeItems = adminFactory
  .createApp()
  // GET /titles?ids= 또는 ?knowledgeType=&q=: 제목만 { items } 로 돌려준다. 검색은 제목순 20건.
  .get("/titles", titlesGuard, validate("query", titlesQuery), async (c) => {
    const query = c.req.valid("query");
    const db = c.var.supabaseAdmin;

    if ("ids" in query) {
      const { data, error } = await db
        .from(TABLE)
        .select("id, title")
        .in("id", query.ids);
      if (error) throw new Error(`제목 조회 실패: ${error.message}`);
      return c.json({ items: toItems(data) } satisfies TitlesResponse);
    }

    if (!query.q) return c.json({ items: [] } satisfies TitlesResponse);
    const { data, error } = await db
      .from(TABLE)
      .select("id, title")
      .eq("knowledge_type", query.knowledgeType)
      .ilike("title", `%${escapeIlike(query.q)}%`)
      .order("title")
      .limit(TITLES_SEARCH_LIMIT);
    if (error) throw new Error(`자료 검색 실패: ${error.message}`);
    return c.json({ items: toItems(data) } satisfies TitlesResponse);
  })
  .all("/titles", methodNotAllowed("GET"));
