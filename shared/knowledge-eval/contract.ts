// 지식 검색 품질 평가 API 계약. 서버(api/_routes/admin/knowledge-eval.ts)는 요청 스키마로 검증하고,
// 브라우저(src/pages/admin/knowledge/evals/api.ts)는 응답 스키마로 검증한다.
// 평가 실행 본문(run, sweep)은 값 규칙과 한국어 사유를 api/_lib/knowledge/eval/metrics.ts 가 맡는다.

import { z } from "zod";
import { uuidId } from "../http/params.js";

export const KNOWLEDGE_TYPES = ["topic_pattern", "verified_resource"] as const;
export const knowledgeTypeSchema = z.enum(KNOWLEDGE_TYPES);
export type KnowledgeType = z.output<typeof knowledgeTypeSchema>;

export const EVAL_MODES = ["vector", "hybrid"] as const;

// ---------------------------------------------------------------------------
// 요청: 기준 문제집(knowledge_golden_queries)
// ---------------------------------------------------------------------------

const goldenFields = {
  grade: z.string().min(1),
  subject: z.string().min(1),
  career: z.string().nullable(),
  selected_topic: z.string().nullable(),
  assessment_info: z.string().nullable(),
  note: z.string().nullable(),
  // 테이블 CHECK 도 1개 이상이라 같은 규칙을 앞에서 막는다.
  expected_resource_ids: z.array(z.uuid()).min(1),
};

/** GET ?view=runs&knowledgeType=. 지식 유형을 비우면 두 유형을 모두 돌려준다. */
export const runsQuery = z.object({
  view: z.literal("runs", { error: "view 는 runs 입니다." }),
  knowledgeType: z
    .union([z.literal("").transform(() => undefined), knowledgeTypeSchema], {
      error: "knowledgeType 이 올바르지 않습니다.",
    })
    .optional(),
});

/** GET /queries?knowledgeType= */
export const goldenListQuery = z.object({ knowledgeType: knowledgeTypeSchema });

/** POST /queries 본문. 옛 화면 폼(QueryDialog)이 만드는 열만 받는다. 모르는 키와 폼에 없는 열(id, is_active 등)은 400 이다. */
export const goldenCreateBody = z.strictObject({
  knowledge_type: knowledgeTypeSchema,
  ...goldenFields,
});
export type GoldenCreateInput = z.input<typeof goldenCreateBody>;

/** PATCH /queries/:id 경로. */
export const goldenIdParams = z.object({ id: uuidId });
/** PATCH /queries/:id?knowledgeType= 범위. 다른 유형의 행은 404 다. */
export const goldenPatchQuery = z.object({
  knowledgeType: knowledgeTypeSchema,
});

/** PATCH /queries/:id 본문. 폼 필드 일부와 비활성 토글(is_active). knowledge_type 은 받지 않는다. 키는 하나 이상. */
export const goldenPatchBody = z
  .strictObject({ ...goldenFields, is_active: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "고칠 값이 하나 이상 필요합니다.",
  });
export type GoldenPatchInput = z.input<typeof goldenPatchBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

export const evalParams = z.object({
  matchThreshold: z.number(),
  rrfK: z.number(),
  fullTextWeight: z.number(),
  semanticWeight: z.number(),
  matchCount: z.number(),
});

export const runMetrics = z.object({
  recall: z.record(z.string(), z.number()),
  mrr: z.number(),
});

export const perQueryResult = z.object({
  queryId: z.string(),
  label: z.string(),
  expectedIds: z.array(z.string()),
  ranks: z.array(z.number().nullable()),
});
export type PerQueryResult = z.output<typeof perQueryResult>;

/** POST { action: "run" } 200. params 는 덮어쓴 값에 운영값을 채운 실행 값이다. */
export const runResponse = z.object({
  runId: z.string(),
  queryCount: z.number(),
  params: evalParams,
  metrics: runMetrics,
  perQuery: z.array(perQueryResult),
});
export type RunResponse = z.output<typeof runResponse>;

/** POST { action: "sweep" } 200. 시간 예산을 넘긴 조합은 skipped 다. */
export const sweepResponse = z.object({
  queryCount: z.number(),
  productionParams: evalParams,
  items: z.array(
    z.discriminatedUnion("status", [
      z.object({
        status: z.literal("done"),
        runId: z.string(),
        params: evalParams,
        metrics: runMetrics,
      }),
      z.object({ status: z.literal("skipped"), params: evalParams }),
    ]),
  ),
});
export type SweepResponse = z.output<typeof sweepResponse>;

/** knowledge_eval_runs 행. 화면이 읽는 열만 검증하고 나머지(created_by 등)는 통과시킨다. */
export const evalRun = z.looseObject({
  id: z.string(),
  created_at: z.string(),
  knowledge_type: knowledgeTypeSchema,
  mode: z.enum(EVAL_MODES),
  params: evalParams,
  query_count: z.number(),
  metrics: runMetrics,
  per_query: z.array(perQueryResult),
  note: z.string().nullable(),
});
export type EvalRun = z.output<typeof evalRun>;

/** GET ?view=runs 200. productionParams 는 지식 유형별 운영값이다. */
export const runsResponse = z.object({
  productionParams: z.object({
    topic_pattern: evalParams,
    verified_resource: evalParams,
  }),
  items: z.array(evalRun),
});
export type RunsResponse = z.output<typeof runsResponse>;

/** 기준 문제집 행. 목록, 만든 행, 고친 행이 같은 모양이다. */
export const goldenQuery = z.object({
  id: z.string(),
  knowledge_type: knowledgeTypeSchema,
  grade: z.string(),
  subject: z.string(),
  career: z.string().nullable(),
  selected_topic: z.string().nullable(),
  assessment_info: z.string().nullable(),
  note: z.string().nullable(),
  expected_resource_ids: z.array(z.string()),
  is_active: z.boolean(),
  created_at: z.string(),
});
export type GoldenQuery = z.output<typeof goldenQuery>;

export const goldenList = z.object({ items: z.array(goldenQuery) });
export type GoldenList = z.output<typeof goldenList>;
