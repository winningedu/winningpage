// /api/admin/knowledge-bulk. 관리자 앱(api/_routes/admin/app.ts)이 .route("/knowledge-bulk", knowledgeBulk) 로 붙인다.
// 요청 검증과 응답 모양은 shared/knowledge/contract.ts 를 따른다.
//
// POST /api/admin/knowledge-bulk
// Authorization: Bearer <supabase access token>   (관리자)
//
// 수행평가 지식 DB 엑셀 일괄 반영. 신규는 insert, 수정은 id 로 update 한다.
// knowledge_type 은 메뉴 고정값으로 덮고, 허용 필드 밖의 키는 버리고, 반영한 행은
// embedding_status 를 pending 으로 돌린다. 임베딩은 화면이 admin-embed backfill 을
// 이어서 부른다.
//
// 요청 { knowledgeType, inserts: [{ ...fields }], updates: [{ id, ...fields }] }  합계 최대 500건
// 응답 200 { inserted, updated, ids }   ids 는 신규 id 뒤에 수정 id 순서다.
// 오류(problem): 400 VALIDATION_FAILED(테이블 컬럼이 아닌 키 포함), 404 NOT_FOUND(수정 대상 id 가 이 메뉴에 없음),
//   401/403, 405, 500
// 권한: knowledgeType 이 가리키는 메뉴(winningSuhaengTopicDb, winningSuhaengResourceDb)의 edit.
// 쓰기 경계: 옛 RLS 는 is_admin 전체라 insert 와 update 만 남기고 delete 는 없다. embedding, search_text 는
//   쓰지 않는다(BULK_WRITABLE_FIELDS 와 강제 컬럼만). 임베딩은 admin-embed 가 채운다.
//
// 단일 트랜잭션이 아니다. 신규 insert 는 한 요청이라 원자적이지만, 수정은 행마다
// update 라 중간에 실패하면 앞의 행은 반영된 채로 남는다(입결정보 청크 반영과 같은 성질).
// 판단과 변환은 api/_lib/knowledge/bulk.ts, 계약 검증은 knowledge-bulk.test.ts.

import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import type { KnowledgeBulkResult } from "../../../shared/knowledge/contract.js";
import { knowledgeBulkBody } from "../../../shared/knowledge/request.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { knowledgePermissionKey } from "../../_lib/knowledge/permission.js";

const KNOWLEDGE_TABLE = "winning_assessment_knowledge_items";

function notInMenu(ids: string[]): ProblemError {
  return new ProblemError(
    404,
    `이 메뉴에 없는 id 가 있습니다: ${ids.slice(0, 5).join(", ")}`,
    PROBLEM_CODE.NOT_FOUND,
  );
}

const guard = admin({
  permission: { key: knowledgePermissionKey },
  unhandledMessage: "엑셀 일괄 반영에 실패했습니다.",
  logLabel: "admin/knowledge-bulk",
});

export const knowledgeBulk = adminFactory
  .createApp()
  .post("/", guard, validate("json", knowledgeBulkBody), async (c) => {
    const { knowledgeType, inserts, updates } = c.req.valid("json");
    const db = c.var.supabaseAdmin;

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
        throw notInMenu(missing);
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
      const { data, error } = await db
        .from(KNOWLEDGE_TABLE)
        .update(patch as Record<string, unknown>)
        .eq("id", id)
        .eq("knowledge_type", knowledgeType)
        .select("id");
      if (error) throw new Error(`수정 실패(${id}): ${error.message}`);
      // 확인 뒤 다른 요청이 행을 지웠거나 메뉴를 옮긴 경우. 앞 행은 이미 반영됐다(트랜잭션 없음).
      if (!data || data.length === 0) {
        throw notInMenu([id]);
      }
      updatedIds.push(id);
    }

    return c.json({
      inserted: insertedIds.length,
      updated: updatedIds.length,
      ids: [...insertedIds, ...updatedIds],
    } satisfies KnowledgeBulkResult);
  })
  .all("/", methodNotAllowed("POST"));
