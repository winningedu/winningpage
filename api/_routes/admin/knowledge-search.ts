// /api/admin/knowledge-search. 관리자 앱(api/_routes/admin/app.ts)이 .route("/knowledge-search", knowledgeSearch) 로 붙인다.
// 요청 검증과 응답 모양은 shared/knowledge/contract.ts 를 따른다.
//
// POST /api/admin/knowledge-search
// Authorization: Bearer <supabase access token>   (관리자)
//
// 수행평가 지식 DB 검색 테스트. 학생 요청 경로(knowledge.ts)와 같은 질의문, 학년 필터,
// 과목 필터로 검색을 돌려 순위와 판정을 함께 돌려준다. 학생 요청 경로의 동작은 바꾸지 않는다.
//   mode hybrid(기본): 학생 요청 경로의 1차 경로(match_winning_suhaeng_hybrid)를 실제
//     threshold 로 부른다. 행마다 의미 순위, 단어 순위, RRF 점수가 붙는다.
//   mode vector: 폴백 경로(match_winning_suhaeng_all_subjects)를 threshold 0 으로 불러
//     threshold 아래 행까지 받는다.
//
// 요청 { knowledgeType: 'topic_pattern' | 'verified_resource', grade, subject, career,
//        selectedTopic?, assessmentInfo?, includeOtherSubjects?, limit?,
//        mode?: 'vector' | 'hybrid' }
//   includeOtherSubjects 기본값은 실제 경로와 같다(주제 true, 자료 false).
//   limit 은 1~50, 기본 20. 두 RPC 본문이 least(match_count, 20) 으로 자르므로 20을
//   넘겨도 20행까지만 온다.
// 응답 200 { mode, threshold, queryText, keywordQuery,
//            items: [{ rank, id, title, grade, subject, career_field, similarity,
//                      passesThreshold, wouldBeInjected,
//                      semanticRank?, keywordRank?, rrfScore? }] }
//   keywordQuery 는 hybrid 일 때 RPC 에 넘긴 단어 질의, vector 일 때 null.
// 오류(problem): 400 VALIDATION_FAILED, 401/403, 405, 500
// 권한: knowledgeType 이 가리키는 메뉴의 view. 읽기 POST 라 level 을 직접 적는다.
//
// 판단은 api/_lib/knowledge/preview.ts, 계약 검증은 knowledge-search.test.ts.

import type { SearchPreviewResult } from "../../../shared/knowledge/contract.js";
import { knowledgeSearchBody } from "../../../shared/knowledge/request.js";
import { scheduleAfterResponse } from "../../_lib/afterResponse.js";
import { performanceTraceContext } from "../../_lib/ai/telemetry/performanceContext.js";
import { createAiTrace } from "../../_lib/ai/telemetry/trace.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { knowledgePermissionKey } from "../../_lib/knowledge/permission.js";
import {
  buildSearchPreviewItems,
  buildSearchPreviewRpc,
} from "../../_lib/knowledge/preview.js";
import { embedText } from "../../_lib/performance/embeddings.js";
import { buildKnowledgeQueryText } from "../../_lib/performance/knowledge.js";

const guard = admin({
  permission: { key: knowledgePermissionKey, level: "view" },
  // 데이터를 바꾸지 않는 읽기 POST 라 조회로 남긴다.
  audit: { action: "view" },
  unhandledMessage: "검색 테스트에 실패했습니다.",
  logLabel: "admin/knowledge-search",
});

export const knowledgeSearch = adminFactory
  .createApp()
  .post("/", guard, validate("json", knowledgeSearchBody), async (c) => {
    const body = c.req.valid("json");
    const db = c.var.supabaseAdmin;
    const queryText = buildKnowledgeQueryText(body);

    const trace = createAiTrace(
      performanceTraceContext({ feature: "knowledge_search_preview" }),
    );
    try {
      const embedding = await embedText(queryText, trace);
      const rpc = buildSearchPreviewRpc(body, embedding);
      // pgvector 인자는 생성 타입이 string 이지만 supabase-js 가 number[] 를 그대로 직렬화한다.
      const queryEmbedding = rpc.args.query_embedding as unknown as string;
      const { data, error } =
        rpc.fn === "match_winning_suhaeng_hybrid"
          ? await db.rpc(rpc.fn, {
              ...rpc.args,
              query_embedding: queryEmbedding,
            })
          : await db.rpc(rpc.fn, {
              ...rpc.args,
              query_embedding: queryEmbedding,
            });
      if (error) throw new Error(`검색 실패: ${error.message}`);

      const { threshold, items } = buildSearchPreviewItems(
        body.knowledgeType,
        data ?? [],
        body.mode,
      );
      return c.json({
        mode: body.mode,
        threshold,
        queryText,
        keywordQuery:
          rpc.fn === "match_winning_suhaeng_hybrid"
            ? rpc.args.query_keywords
            : null,
        items,
      } satisfies SearchPreviewResult);
    } finally {
      scheduleAfterResponse(() => trace.flush(db));
    }
  })
  .all("/", methodNotAllowed("POST"));
