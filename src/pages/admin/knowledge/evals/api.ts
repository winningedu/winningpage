// 지식 검색 품질 평가 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.
// 평가 실행과 이력은 admin/knowledge-eval, 문제집은 admin/knowledge-eval/queries,
// 기대 자료 제목은 admin/knowledge-items/titles 다. 브라우저는 DB 를 직접 부르지 않는다.

import { z } from "zod";
import { ApiError, api } from "@/lib/http/client";
import type {
  EvalParams,
  ExpectedResource,
  GoldenRowInput,
  KnowledgeType,
  SweepGrid,
} from "./form";

// 서버 maxDuration(knowledge-eval 60초)보다 조금 길게 잡아 서버 응답을 기다린다.
const RUN_TIMEOUT_MS = 65_000;

/** 서버가 한 번에 받는 id 수 상한(titles 라우트와 같다). */
const TITLES_CHUNK = 200;

export const evalKeys = {
  all: ["admin", "knowledge-evals"] as const,
  runs: (knowledgeType: KnowledgeType) =>
    [...evalKeys.all, "runs", knowledgeType] as const,
  queries: (knowledgeType: KnowledgeType) =>
    [...evalKeys.all, "queries", knowledgeType] as const,
  titles: (ids: string) => [...evalKeys.all, "titles", ids] as const,
};

const knowledgeTypeSchema = z.enum(["topic_pattern", "verified_resource"]);

const evalParamsSchema = z.object({
  matchThreshold: z.number(),
  rrfK: z.number(),
  fullTextWeight: z.number(),
  semanticWeight: z.number(),
  matchCount: z.number(),
});

const metricsSchema = z.object({
  recall: z.record(z.string(), z.number()),
  mrr: z.number(),
});

const perQuerySchema = z.object({
  queryId: z.string(),
  label: z.string(),
  expectedIds: z.array(z.string()),
  ranks: z.array(z.number().nullable()),
});
export type PerQueryResult = z.infer<typeof perQuerySchema>;

const runResponseSchema = z.object({
  runId: z.string(),
  queryCount: z.number(),
  params: evalParamsSchema,
  metrics: metricsSchema,
  perQuery: z.array(perQuerySchema),
});
export type RunResponse = z.infer<typeof runResponseSchema>;

const sweepResponseSchema = z.object({
  queryCount: z.number(),
  productionParams: evalParamsSchema,
  items: z.array(
    z.discriminatedUnion("status", [
      z.object({
        status: z.literal("done"),
        runId: z.string(),
        params: evalParamsSchema,
        metrics: metricsSchema,
      }),
      z.object({ status: z.literal("skipped"), params: evalParamsSchema }),
    ]),
  ),
});
export type SweepResponse = z.infer<typeof sweepResponseSchema>;

const evalRunSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  knowledge_type: knowledgeTypeSchema,
  mode: z.enum(["vector", "hybrid"]),
  params: evalParamsSchema,
  query_count: z.number(),
  metrics: metricsSchema,
  per_query: z.array(perQuerySchema),
  note: z.string().nullable(),
});
export type EvalRun = z.infer<typeof evalRunSchema>;

const runsResponseSchema = z.object({
  productionParams: z.object({
    topic_pattern: evalParamsSchema,
    verified_resource: evalParamsSchema,
  }),
  items: z.array(evalRunSchema),
});
export type RunsResponse = z.infer<typeof runsResponseSchema>;

const goldenQuerySchema = z.object({
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
export type GoldenQuery = z.infer<typeof goldenQuerySchema>;

const goldenListSchema = z.object({ items: z.array(goldenQuerySchema) });

const titlesSchema = z.object({
  items: z.array(z.object({ id: z.string(), title: z.string() })),
});

/** 화면에 보여 줄 실패 문구. 서버가 준 problem 의 detail 이 있으면 그것이다. */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return error instanceof Error ? error.message : String(error);
}

/** 서버 문구 대신 동작 이름으로 알리는 실패 문구. 원인은 콘솔에 남긴다. */
export function failureText(label: string, error: unknown): string {
  console.error(error);
  return `${label}에 실패했습니다.`;
}

export function fetchRuns(
  knowledgeType: KnowledgeType,
  signal?: AbortSignal,
): Promise<RunsResponse> {
  return api
    .get("admin/knowledge-eval", {
      searchParams: { view: "runs", knowledgeType },
      ...(signal ? { signal } : {}),
    })
    .json(runsResponseSchema);
}

export function postRun(body: {
  knowledgeType: KnowledgeType;
  mode: "vector" | "hybrid";
  params: Partial<EvalParams>;
  note?: string;
}): Promise<RunResponse> {
  return api
    .post("admin/knowledge-eval", {
      json: { action: "run", ...body },
      timeout: RUN_TIMEOUT_MS,
    })
    .json(runResponseSchema);
}

export function postSweep(body: {
  knowledgeType: KnowledgeType;
  grid: SweepGrid;
  note?: string;
}): Promise<SweepResponse> {
  return api
    .post("admin/knowledge-eval", {
      json: { action: "sweep", ...body },
      timeout: RUN_TIMEOUT_MS,
    })
    .json(sweepResponseSchema);
}

export async function listGoldenQueries(
  knowledgeType: KnowledgeType,
  signal?: AbortSignal,
): Promise<GoldenQuery[]> {
  const reply = await api
    .get("admin/knowledge-eval/queries", {
      searchParams: { knowledgeType },
      ...(signal ? { signal } : {}),
    })
    .json(goldenListSchema);
  return reply.items;
}

export function createGoldenQuery(row: GoldenRowInput): Promise<GoldenQuery> {
  return api
    .post("admin/knowledge-eval/queries", { json: row })
    .json(goldenQuerySchema);
}

/** 질의 수정과 비활성 토글. 유형은 고칠 수 없고 범위(쿼리)로만 보낸다. */
export function patchGoldenQuery(
  id: string,
  knowledgeType: KnowledgeType,
  body: Partial<Omit<GoldenRowInput, "knowledge_type">> & {
    is_active?: boolean;
  },
): Promise<GoldenQuery> {
  return api
    .patch(`admin/knowledge-eval/queries/${id}`, {
      searchParams: { knowledgeType },
      json: body,
    })
    .json(goldenQuerySchema);
}

export async function searchKnowledgeResources(
  knowledgeType: KnowledgeType,
  term: string,
): Promise<ExpectedResource[]> {
  const q = term.trim();
  if (!q) return [];
  const reply = await api
    .get("admin/knowledge-items/titles", {
      searchParams: { knowledgeType, q },
    })
    .json(titlesSchema);
  return reply.items;
}

/** 기대 자료 id 의 제목. 표와 편집 Dialog 에서 id 대신 제목을 보여 준다. 서버 상한마다 나눠 부른다. */
export async function fetchResourceTitles(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let start = 0; start < unique.length; start += TITLES_CHUNK) {
    chunks.push(unique.slice(start, start + TITLES_CHUNK));
  }
  const replies = await Promise.all(
    chunks.map((chunk) =>
      api
        .get("admin/knowledge-items/titles", {
          searchParams: { ids: chunk.join(",") },
          ...(signal ? { signal } : {}),
        })
        .json(titlesSchema),
    ),
  );
  return Object.fromEntries(
    replies.flatMap((reply) => reply.items.map((row) => [row.id, row.title])),
  );
}
