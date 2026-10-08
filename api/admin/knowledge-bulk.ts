// POST /api/admin/knowledge-bulk
// Authorization: Bearer <supabase access token>   (관리자)
//
// 수행평가 지식 DB 엑셀 일괄 반영. 신규는 insert, 수정은 id 로 update 한다.
// knowledge_type 은 메뉴 고정값으로 덮고, 허용 필드 밖의 키는 버리고, 반영한 행은
// embedding_status 를 pending 으로 돌린다. 임베딩은 화면이 admin-embed backfill 을
// 이어서 부른다.
//
// 요청 { knowledgeType, inserts: [{ ...fields }], updates: [{ id, ...fields }] }  합계 최대 500건
// 응답 200 { ok, inserted, updated, ids }   ids 는 신규 id 뒤에 수정 id 순서다.
// 오류(coded): 400 INVALID_BODY, 404 NOT_FOUND(수정 대상 id 가 이 메뉴에 없음),
//   401/403 인증, 405 METHOD_NOT_ALLOWED, 500 INTERNAL
//
// 단일 트랜잭션이 아니다. 신규 insert 는 한 요청이라 원자적이지만, 수정은 행마다
// update 라 중간에 실패하면 앞의 행은 반영된 채로 남는다(입결정보 청크 반영과 같은 성질).
// 핸들러 본문은 테스트하지 않는다. 판단과 변환은 api/_lib/knowledge/bulk.ts.

import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { validateBulkBody } from "../_lib/knowledge/bulk.js";

const KNOWLEDGE_TABLE = "winning_assessment_knowledge_items";

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "엑셀 일괄 반영에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "admin/knowledge-bulk",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const parsed = validateBulkBody(req.body);
    if (!parsed.ok) {
      sendError(res, "coded", 400, parsed.reason, "INVALID_BODY", {
        ok: false,
      });
      return;
    }
    const { knowledgeType, inserts, updates } = parsed.body;
    const db = ctx.supabaseAdmin;

    // 수정 대상이 전부 이 메뉴(knowledge_type) 행인지 먼저 본다. 다른 메뉴 행을
    // 덮어 메뉴를 옮겨 버리는 일을 막는다.
    if (updates.length > 0) {
      const ids = updates.map((u) => u.id);
      const { data, error } = await db
        .from(KNOWLEDGE_TABLE)
        .select("id")
        .eq("knowledge_type", knowledgeType)
        .in("id", ids);
      if (error) throw new Error(`수정 대상 조회 실패: ${error.message}`);
      const found = new Set((data ?? []).map((row) => row.id));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length > 0) {
        sendError(
          res,
          "coded",
          404,
          `이 메뉴에 없는 id 가 있습니다: ${missing.slice(0, 5).join(", ")}`,
          "NOT_FOUND",
          { ok: false },
        );
        return;
      }
    }

    const insertedIds: string[] = [];
    if (inserts.length > 0) {
      const { data, error } = await db
        .from(KNOWLEDGE_TABLE)
        .insert(
          inserts.map((row) => ({
            ...row,
            grade: String(row.grade),
            subject: String(row.subject),
            title: String(row.title),
            content: String(row.content),
          })),
        )
        .select("id");
      if (error) throw new Error(`신규 등록 실패: ${error.message}`);
      insertedIds.push(...(data ?? []).map((row) => row.id));
    }

    const updatedIds: string[] = [];
    for (const { id, patch } of updates) {
      const { error } = await db
        .from(KNOWLEDGE_TABLE)
        .update(patch as Record<string, unknown>)
        .eq("id", id)
        .eq("knowledge_type", knowledgeType);
      if (error) throw new Error(`수정 실패(${id}): ${error.message}`);
      updatedIds.push(id);
    }

    res.status(200).json({
      ok: true,
      inserted: insertedIds.length,
      updated: updatedIds.length,
      ids: [...insertedIds, ...updatedIds],
    });
  },
});
