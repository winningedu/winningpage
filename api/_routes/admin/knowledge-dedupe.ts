// /api/admin/knowledge-dedupe. 관리자 앱(api/_routes/admin/app.ts)이 .route("/knowledge-dedupe", knowledgeDedupe) 로 붙인다.
// 요청 검증과 응답 모양은 shared/knowledge/contract.ts 를 따른다.
//
// POST /api/admin/knowledge-dedupe
// Authorization: Bearer <supabase access token>   (관리자)
//
// 수행평가 지식 DB 엑셀 일괄 등록 전에 업로드 행이 기존 행과 겹치는지 2단계로 본다.
//   1차 정확 일치: 제목과 내용의 정규화 해시를 같은 knowledge_type 기존 행 전체와 대조한다.
//   2차 근사 일치: 행마다 검색 텍스트(buildKnowledgeSearchText)를 임베딩해
//     fn_knowledge_near_duplicates 로 코사인 0.95 이상인 기존 행을 찾는다.
//
// 요청 { knowledgeType: 'topic_pattern' | 'verified_resource',
//        items: [{ rowNo, id?, title, content, grade, subject, career_field,
//                  source, source_link, keywords, memo }] }   최대 200건
//   id 는 수정 행일 때만 보낸다. 자기 자신을 중복으로 잡지 않게 뺀다.
// 응답 200 { items: [{ rowNo, exact: [{ id, title }], near: [{ id, title, similarity }] }] }
// 오류(problem): 400 VALIDATION_FAILED, 401/403, 405, 500
// 권한: knowledgeType 이 가리키는 메뉴(winningSuhaengTopicDb, winningSuhaengResourceDb)의 edit.
//   쓰기는 아니지만 행마다 임베딩 호출 비용이 드는 일괄 반영의 첫 단계라 edit 를 요구한다.
//
// 임베딩 호출이 행당 1회라 60초 상한 안에 끝나도록 화면은 작은 묶음으로 나눠 부른다.
// 판단은 api/_lib/knowledge/dedupe.ts, 계약 검증은 knowledge-dedupe.test.ts.

import type { KnowledgeDedupeResult } from "../../../shared/knowledge/contract.js";
import { scheduleAfterResponse } from "../../_lib/afterResponse.js";
import { performanceTraceContext } from "../../_lib/ai/telemetry/performanceContext.js";
import { createAiTrace } from "../../_lib/ai/telemetry/trace.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { knowledgeBodySchema } from "../../_lib/knowledge/bodySchema.js";
import {
  detectKnowledgeDuplicates,
  validateDedupeBody,
} from "../../_lib/knowledge/dedupe.js";
import { knowledgePermissionKey } from "../../_lib/knowledge/permission.js";
import {
  buildKnowledgeSearchText,
  embedText,
} from "../../_lib/performance/embeddings.js";

const KNOWLEDGE_TABLE = "winning_assessment_knowledge_items";

// PostgREST 기본 최대 행 수(1000)보다 크지 않게 페이지를 끊는다.
const EXISTING_PAGE_SIZE = 1000;

// 한 행에 돌려줄 근사 후보 상한. 화면이 경고로 보여 줄 만큼이면 충분하다.
const NEAR_MATCH_COUNT = 5;

const guard = admin({
  permission: { key: knowledgePermissionKey, level: "edit" },
  // 데이터를 바꾸지 않는 읽기 POST 라 조회로 남긴다.
  audit: { action: "view" },
  unhandledMessage: "중복 검사에 실패했습니다.",
  logLabel: "admin/knowledge-dedupe",
});

export const knowledgeDedupe = adminFactory
  .createApp()
  .post(
    "/",
    guard,
    validate("json", knowledgeBodySchema(validateDedupeBody)),
    async (c) => {
      const body = c.req.valid("json");
      const db = c.var.supabaseAdmin;

      const existing: Array<{ id: string; title: string; content: string }> =
        [];
      for (let from = 0; ; from += EXISTING_PAGE_SIZE) {
        const { data, error } = await db
          .from(KNOWLEDGE_TABLE)
          .select("id, title, content")
          .eq("knowledge_type", body.knowledgeType)
          .order("id", { ascending: true })
          .range(from, from + EXISTING_PAGE_SIZE - 1);
        if (error) throw new Error(`기존 행 조회 실패: ${error.message}`);
        existing.push(...(data ?? []));
        if (!data || data.length < EXISTING_PAGE_SIZE) break;
      }

      const trace = createAiTrace(
        performanceTraceContext({ feature: "knowledge_dedupe" }),
      );
      try {
        const items = await detectKnowledgeDuplicates(body, {
          existing,
          embed: (item) => embedText(buildKnowledgeSearchText(item), trace),
          searchNear: async (embedding, minSimilarity) => {
            const { data, error } = await db.rpc(
              "fn_knowledge_near_duplicates",
              {
                // pgvector 인자는 생성 타입이 string 이지만 supabase-js 가 number[] 를 그대로 직렬화한다.
                query_embedding: embedding as unknown as string,
                filter_knowledge_type: body.knowledgeType,
                min_similarity: minSimilarity,
                match_count: NEAR_MATCH_COUNT,
              },
            );
            if (error) throw new Error(`근사 중복 조회 실패: ${error.message}`);
            return data ?? [];
          },
        });
        return c.json({ items } satisfies KnowledgeDedupeResult);
      } finally {
        scheduleAfterResponse(() => trace.flush(db));
      }
    },
  )
  .all("/", methodNotAllowed("POST"));
