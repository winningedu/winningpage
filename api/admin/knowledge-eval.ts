// GET  /api/admin/knowledge-eval?view=runs&knowledgeType=
// POST /api/admin/knowledge-eval
// Authorization: Bearer <supabase access token>   (관리자)
//
// 지식 검색 품질 평가. 기준 문제집(knowledge_golden_queries)의 활성 질의를 학생 요청 경로와
// 같은 질의문, 단어 질의, 학년 필터, 과목 필터로 검색해 recall@k 와 MRR 을 잰다.
// 운영 검색 상수와 학생 요청 경로는 바꾸지 않는다. 평가 실행에서만 파라미터를 덮어쓴다.
// 문제집 CRUD 는 RLS 가 관리자에게 열려 있어 관리자 화면이 클라이언트 Supabase 로 직접 한다.
//
// POST { action: "run", knowledgeType, mode?: "hybrid" | "vector", params?, note? }
//   params 는 matchThreshold(0~1), rrfK(1~200 정수), fullTextWeight(0~5),
//   semanticWeight(0~5), matchCount(1~20 정수) 중 덮어쓸 값만. 빠진 값은 운영값이다.
//   200 { ok, runId, queryCount, params, metrics, perQuery }
// POST { action: "sweep", knowledgeType, grid: { rrfK?: number[],
//        weights?: { fullText, semantic }[], matchThreshold?: number[] }, note? }
//   조합은 24개까지, 모드는 hybrid. 임베딩은 질의당 1회만 만든다. 시간 예산 50초를 넘기면
//   남은 조합은 skipped 다. 끝난 조합마다 knowledge_eval_runs 1행을 저장한다.
//   200 { ok, queryCount, productionParams, items: [{ status, runId?, params, metrics? }] }
// GET  ?view=runs&knowledgeType=  최근 50건
//   200 { ok, productionParams, items: knowledge_eval_runs 행[] }
//   productionParams 는 지식 유형별 운영값 { topic_pattern, verified_resource }.
// metrics 모양 { recall: { "1", "3", "5", "10" }, mrr }
// 오류(coded): 400 INVALID_BODY, INVALID_QUERY, NO_QUERIES, 401/403 인증,
//   405 METHOD_NOT_ALLOWED, 500 INTERNAL
//
// 핸들러 본문은 테스트하지 않는다. 판단은 api/_lib/knowledge/eval/metrics.ts,
// DB 와 임베딩 호출은 api/_lib/knowledge/eval/runner.ts.

import { performanceTraceContext } from "../_lib/ai/telemetry/performanceContext.js";
import { createAiTrace } from "../_lib/ai/telemetry/trace.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  EVAL_RUNS_LIMIT,
  parseEvalRequest,
  parseRunsQuery,
  productionEvalParams,
} from "../_lib/knowledge/eval/metrics.js";
import {
  runGoldenEval,
  runGoldenSweep,
} from "../_lib/knowledge/eval/runner.js";

/** 조합 비교 시간 예산. maxDuration 60초 안에서 저장과 응답 시간을 남긴다. */
const SWEEP_BUDGET_MS = 50_000;

const RUN_COLUMNS =
  "id, created_at, created_by, knowledge_type, mode, params, query_count, metrics, per_query, note";

function productionParamsByType() {
  return {
    topic_pattern: productionEvalParams("topic_pattern"),
    verified_resource: productionEvalParams("verified_resource"),
  };
}

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "admin",
  errorShape: "coded",
  methodNotAllowedMessage: "GET, POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "지식 검색 품질 평가에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "admin/knowledge-eval",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const startedAt = Date.now();
    const db = ctx.supabaseAdmin;

    if (req.method === "GET") {
      const parsed = parseRunsQuery(req.query);
      if (!parsed.ok) {
        sendError(res, "coded", 400, parsed.reason, "INVALID_QUERY", {
          ok: false,
        });
        return;
      }
      let query = db.from("knowledge_eval_runs").select(RUN_COLUMNS);
      if (parsed.knowledgeType) {
        query = query.eq("knowledge_type", parsed.knowledgeType);
      }
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(EVAL_RUNS_LIMIT);
      if (error) throw new Error(`실행 이력 조회 실패: ${error.message}`);
      res.status(200).json({
        ok: true,
        productionParams: productionParamsByType(),
        items: data ?? [],
      });
      return;
    }

    const parsed = parseEvalRequest(req.body);
    if (!parsed.ok) {
      sendError(res, "coded", 400, parsed.reason, "INVALID_BODY", {
        ok: false,
      });
      return;
    }
    const { request } = parsed;
    const trace = createAiTrace(
      performanceTraceContext({ feature: "knowledge_eval" }),
    );
    const common = {
      db,
      knowledgeType: request.knowledgeType,
      userId: ctx.userId ?? null,
      note: request.note,
      trace,
    };

    try {
      if (request.action === "run") {
        const outcome = await runGoldenEval({
          ...common,
          mode: request.mode,
          params: request.params,
        });
        if (!outcome.ok) {
          sendError(res, "coded", 400, outcome.reason, "NO_QUERIES", {
            ok: false,
          });
          return;
        }
        res.status(200).json({
          ok: true,
          runId: outcome.runId,
          queryCount: outcome.queryCount,
          params: request.params,
          metrics: outcome.metrics,
          perQuery: outcome.perQuery,
        });
        return;
      }

      const outcome = await runGoldenSweep({
        ...common,
        combos: request.combos,
        startedAt,
        budgetMs: SWEEP_BUDGET_MS,
      });
      if (!outcome.ok) {
        sendError(res, "coded", 400, outcome.reason, "NO_QUERIES", {
          ok: false,
        });
        return;
      }
      res.status(200).json({
        ok: true,
        queryCount: outcome.queryCount,
        productionParams: productionEvalParams(request.knowledgeType),
        items: outcome.items,
      });
    } finally {
      await trace.flush(db);
    }
  },
});

export const config = { runtime: "nodejs", maxDuration: 60 };
