// POST /api/performance/admin-knowledge-search
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
// 응답 200 { ok, mode, threshold, queryText, keywordQuery,
//            items: [{ rank, id, title, grade, subject, career_field, similarity,
//                      passesThreshold, wouldBeInjected,
//                      semanticRank?, keywordRank?, rrfScore? }] }
//   keywordQuery 는 hybrid 일 때 RPC 에 넘긴 단어 질의, vector 일 때 null.
// 오류(coded): 400 INVALID_BODY, 401/403 인증, 405 METHOD_NOT_ALLOWED, 500 INTERNAL
//
// 핸들러 본문은 테스트하지 않는다. 판단은 api/_lib/performance/searchPreview.ts.

import { performanceTraceContext } from "../_lib/aiTelemetry/performanceContext.js";
import { createAiTrace } from "../_lib/aiTelemetry/trace.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { embedText } from "../_lib/performance/embeddings.js";
import { buildKnowledgeQueryText } from "../_lib/performance/knowledge.js";
import {
  buildSearchPreviewItems,
  buildSearchPreviewRpc,
  validateSearchPreviewBody,
} from "../_lib/performance/searchPreview.js";

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "검색 테스트에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "performance/admin-knowledge-search",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const parsed = validateSearchPreviewBody(req.body);
    if (!parsed.ok) {
      sendError(res, "coded", 400, parsed.reason, "INVALID_BODY", {
        ok: false,
      });
      return;
    }
    const { body } = parsed;
    const db = ctx.supabaseAdmin;
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
      res.status(200).json({
        ok: true,
        mode: body.mode,
        threshold,
        queryText,
        keywordQuery:
          rpc.fn === "match_winning_suhaeng_hybrid"
            ? rpc.args.query_keywords
            : null,
        items,
      });
    } finally {
      await trace.flush(db);
    }
  },
});

export const config = { runtime: "nodejs", maxDuration: 30 };
