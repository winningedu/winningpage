// GET /api/admin/knowledge-items/titles
//
// 기준 문제집 화면이 지식 항목의 제목만 읽는 두 방식. 다른 열(embedding, content 등)은 돌려주지 않는다.
//   ?ids=<uuid,uuid,...>      id 로 제목 조회(200개까지). 지식 유형은 거르지 않는다(옛 화면과 같다).
//   ?knowledgeType=&q=        그 유형에서 제목 ilike 검색, 제목순 20건. q 가 비면 조회 없이 빈 items.
// 둘 중 하나만 쓴다(ids 는 knowledgeType, q 와 함께 못 쓴다). 응답 200 { items: [{ id, title }] }, title 이 비면 "".
// 오류(problem): 400 VALIDATION_FAILED, 401/403, 405, 500
// 권한: 메뉴 knowledgeEvals 의 view(읽기 전용이고 평가 화면이 쓰는 읽기만 연다).
// 계약 검증은 titles.test.ts.

import { z } from "zod";
import { defineHandler } from "../../../_lib/handler.js";
import { goldenKnowledgeTypeSchema } from "../../../_lib/knowledge/eval/golden.js";

const TABLE = "winning_assessment_knowledge_items";
/** 한 번에 읽는 id 수 상한. */
const IDS_MAX = 200;
/** 기대 자료 검색 결과 수 상한(옛 화면과 같다). */
const SEARCH_LIMIT = 20;

/** ilike 의 \ % _ 를 글자 그대로 찾게 한다. */
function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const idList = z
  .string()
  .transform((text) => [...new Set(text.split(",").map((part) => part.trim()))])
  .pipe(z.array(z.uuid()).min(1).max(IDS_MAX));

const querySchema = z.union([
  z.strictObject({ ids: idList }),
  z.strictObject({
    knowledgeType: goldenKnowledgeTypeSchema,
    q: z
      .string()
      .optional()
      .transform((text) => (text ?? "").trim()),
  }),
]);

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "knowledgeEvals" },
  unhandledMessage: "자료 제목을 읽지 못했어요.",
  logLabel: "admin/knowledge-items/titles",
  headers: { "Cache-Control": "no-store" },
  query: querySchema,
  handler: async (_req, res, ctx) => {
    const query = ctx.query;
    const db = ctx.supabaseAdmin;

    if ("ids" in query) {
      const { data, error } = await db
        .from(TABLE)
        .select("id, title")
        .in("id", query.ids);
      if (error) throw new Error(`제목 조회 실패: ${error.message}`);
      res.status(200).json({ items: toItems(data) });
      return;
    }

    if (!query.q) {
      res.status(200).json({ items: [] });
      return;
    }
    const { data, error } = await db
      .from(TABLE)
      .select("id, title")
      .eq("knowledge_type", query.knowledgeType)
      .ilike("title", `%${escapeIlike(query.q)}%`)
      .order("title")
      .limit(SEARCH_LIMIT);
    if (error) throw new Error(`자료 검색 실패: ${error.message}`);
    res.status(200).json({ items: toItems(data) });
  },
});

function toItems(rows: { id: string; title: string | null }[] | null) {
  return (rows ?? []).map((row) => ({ id: row.id, title: row.title ?? "" }));
}
