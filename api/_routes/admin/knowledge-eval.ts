// /api/admin/knowledge-eval 아래 지식 검색 품질 평가 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/knowledge-eval", knowledgeEval) 로 붙인다.
// 응답 모양은 shared/knowledge-eval/contract.ts 를 따른다. 권한: 메뉴 knowledgeEvals(GET view, 쓰기 edit).
//
// GET, POST /: 평가 실행과 이력. maxDuration 60초라 vercel.json 이 이 경로만 /api/app-60 으로 보낸다.
//   기준 문제집(knowledge_golden_queries)의 활성 질의를 학생 요청 경로와 같은 질의문, 단어 질의, 학년 필터,
//   과목 필터로 검색해 recall@k 와 MRR 을 잰다. 운영 검색 상수와 학생 요청 경로는 바꾸지 않고 평가 실행에서만 덮어쓴다.
//   POST { action: "run", knowledgeType, mode?: "hybrid" | "vector", params?, note? }
//     params 는 matchThreshold(0~1), rrfK(1~200 정수), fullTextWeight(0~5), semanticWeight(0~5), matchCount(1~20 정수)
//     중 덮어쓸 값만. 빠진 값은 운영값이다. 200 { runId, queryCount, params, metrics, perQuery }
//   POST { action: "sweep", knowledgeType, grid: { rrfK?, weights?: { fullText, semantic }[], matchThreshold? }, note? }
//     조합은 24개까지, 모드는 hybrid. 임베딩은 질의당 1회. 시간 예산 50초를 넘기면 남은 조합은 skipped 다.
//     끝난 조합마다 knowledge_eval_runs 1행을 저장한다. 200 { queryCount, productionParams, items }
//   GET ?view=runs&knowledgeType=  최근 50건. 200 { productionParams, items }
//   활성 질의가 없으면 422 NO_QUERIES. 본문과 쿼리의 값 규칙과 한국어 사유는 api/_lib/knowledge/eval/metrics.ts 가 맡는다.
// GET, POST /queries, PATCH /queries/:id: 기준 문제집 목록, 추가, 수정과 비활성 토글. 삭제는 없다(비활성으로 갈음).
//   옛 RLS 는 is_admin 전체라 화면이 쓰던 insert 와 update 만 연다.

import {
  type GoldenList,
  type GoldenQuery,
  goldenCreateBody,
  goldenIdParams,
  goldenListQuery,
  goldenPatchBody,
  goldenPatchQuery,
  type RunResponse,
  type RunsResponse,
  runsQuery,
  type SweepResponse,
} from "../../../shared/knowledge-eval/contract.js";
import { scheduleAfterResponse } from "../../_lib/afterResponse.js";
import { performanceTraceContext } from "../../_lib/ai/telemetry/performanceContext.js";
import { createAiTrace } from "../../_lib/ai/telemetry/trace.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import {
  methodNotAllowed,
  notFound,
  ProblemError,
} from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { knowledgeBodySchema } from "../../_lib/knowledge/bodySchema.js";
import {
  EVAL_RUNS_LIMIT,
  parseEvalRequest,
  productionEvalParams,
} from "../../_lib/knowledge/eval/metrics.js";
import {
  runGoldenEval,
  runGoldenSweep,
} from "../../_lib/knowledge/eval/runner.js";

/** 조합 비교 시간 예산. maxDuration 60초 안에서 저장과 응답 시간을 남긴다. */
const SWEEP_BUDGET_MS = 50_000;

const RUN_COLUMNS =
  "id, created_at, created_by, knowledge_type, mode, params, query_count, metrics, per_query, note";

/** 기준 문제집에서 옛 화면이 읽던 열. 목록, 만든 행, 고친 행이 같은 모양이다. */
const GOLDEN_COLUMNS =
  "id, knowledge_type, grade, subject, career, selected_topic, assessment_info, note, expected_resource_ids, is_active, created_at";

const evalBodySchema = knowledgeBodySchema((raw) => {
  const parsed = parseEvalRequest(raw);
  return parsed.ok ? { ok: true, body: parsed.request } : parsed;
});

const noQueries = (reason: string) =>
  new ProblemError(422, reason, "NO_QUERIES");

const evalGuard = admin({
  permission: { key: "knowledgeEvals" },
  unhandledMessage: "지식 검색 품질 평가에 실패했습니다.",
  logLabel: "admin/knowledge-eval",
});
const queriesGuard = admin({
  permission: { key: "knowledgeEvals" },
  unhandledMessage: "기준 문제집을 처리하지 못했어요.",
  logLabel: "admin/knowledge-eval/queries",
});
const queryByIdGuard = admin({
  permission: { key: "knowledgeEvals" },
  unhandledMessage: "질의를 고치지 못했어요.",
  logLabel: "admin/knowledge-eval/queries/id",
});

export const knowledgeEval = adminFactory
  .createApp()
  .get("/", evalGuard, validate("query", runsQuery), async (c) => {
    const { knowledgeType } = c.req.valid("query");
    let query = c.var.supabaseAdmin
      .from("knowledge_eval_runs")
      .select(RUN_COLUMNS);
    if (knowledgeType) query = query.eq("knowledge_type", knowledgeType);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(EVAL_RUNS_LIMIT);
    if (error) throw new Error(`실행 이력 조회 실패: ${error.message}`);
    return c.json({
      productionParams: {
        topic_pattern: productionEvalParams("topic_pattern"),
        verified_resource: productionEvalParams("verified_resource"),
      },
      items: data ?? [],
    } satisfies RunsResponse);
  })
  .post("/", evalGuard, validate("json", evalBodySchema), async (c) => {
    const startedAt = Date.now();
    const db = c.var.supabaseAdmin;
    const request = c.req.valid("json");
    const trace = createAiTrace(
      performanceTraceContext({ feature: "knowledge_eval" }),
    );
    const common = {
      db,
      knowledgeType: request.knowledgeType,
      userId: c.var.userId ?? null,
      note: request.note,
      trace,
    };

    // 텔레메트리 flush 는 응답 뒤로 넘기고 기다리지 않는다.
    try {
      if (request.action === "run") {
        const outcome = await runGoldenEval({
          ...common,
          mode: request.mode,
          params: request.params,
        });
        if (!outcome.ok) throw noQueries(outcome.reason);
        return c.json({
          runId: outcome.runId,
          queryCount: outcome.queryCount,
          params: request.params,
          metrics: outcome.metrics,
          perQuery: outcome.perQuery,
        } satisfies RunResponse);
      }

      const outcome = await runGoldenSweep({
        ...common,
        combos: request.combos,
        startedAt,
        budgetMs: SWEEP_BUDGET_MS,
      });
      if (!outcome.ok) throw noQueries(outcome.reason);
      return c.json({
        queryCount: outcome.queryCount,
        productionParams: productionEvalParams(request.knowledgeType),
        items: outcome.items,
      } satisfies SweepResponse);
    } finally {
      scheduleAfterResponse(() => trace.flush(db));
    }
  })
  .all("/", methodNotAllowed("GET", "POST"))
  // GET /queries?knowledgeType=: 그 유형의 질의 전부(활성 먼저, 오래된 순). 200 { items }
  // POST /queries: 201 만든 행. 폼에 없는 열(id, is_active, created_by 등)은 400 이다.
  .get(
    "/queries",
    queriesGuard,
    validate("query", goldenListQuery),
    async (c) => {
      const { data, error } = await c.var.supabaseAdmin
        .from("knowledge_golden_queries")
        .select(GOLDEN_COLUMNS)
        .eq("knowledge_type", c.req.valid("query").knowledgeType)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw new Error(`문제집 조회 실패: ${error.message}`);
      return c.json({ items: data ?? [] } satisfies GoldenList);
    },
  )
  .post(
    "/queries",
    queriesGuard,
    validate("json", goldenCreateBody),
    async (c) => {
      const { data, error } = await c.var.supabaseAdmin
        .from("knowledge_golden_queries")
        .insert(c.req.valid("json"))
        .select(GOLDEN_COLUMNS)
        .single();
      if (error) throw new Error(`질의 저장 실패: ${error.message}`);
      return c.json(data satisfies GoldenQuery, 201);
    },
  )
  .all("/queries", methodNotAllowed("GET", "POST"))
  // PATCH /queries/:id?knowledgeType=: 폼 필드 일부와 is_active 를 고친다. 유형은 옮기지 않는다.
  //   옛 화면은 고른 유형의 질의만 보이고 고쳤으므로 다른 유형 행은 404 다. 검증 순서는 본문, 쿼리, 경로다.
  .patch(
    "/queries/:id",
    queryByIdGuard,
    validate("json", goldenPatchBody),
    validate("query", goldenPatchQuery),
    validate("param", goldenIdParams),
    async (c) => {
      const { data, error } = await c.var.supabaseAdmin
        .from("knowledge_golden_queries")
        .update(c.req.valid("json"))
        .eq("id", c.req.valid("param").id)
        .eq("knowledge_type", c.req.valid("query").knowledgeType)
        .select(GOLDEN_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(`질의 수정 실패: ${error.message}`);
      if (!data) throw notFound("질의");
      return c.json(data satisfies GoldenQuery);
    },
  )
  .all("/queries/:id", methodNotAllowed("PATCH"));
