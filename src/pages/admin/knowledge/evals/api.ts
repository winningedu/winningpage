// 지식 검색 품질 평가 화면의 서버 호출. 응답 모양은 zod 로 검증하고, 조회는 react-query 키로 묶는다.
// 평가 실행과 이력은 admin/knowledge-eval, 문제집은 admin/knowledge-eval/queries,
// 기대 자료 제목은 admin/knowledge-items/titles 다. 브라우저는 DB 를 직접 부르지 않는다.

import { ApiError, api } from "@/lib/http/client";
import {
  type EvalRun,
  type GoldenPatchInput,
  type GoldenQuery,
  goldenList,
  goldenQuery,
  type PerQueryResult,
  type RunResponse,
  type RunsResponse,
  runResponse,
  runsResponse,
  type SweepResponse,
  sweepResponse,
} from "../../../../../shared/knowledge-eval/contract.js";
import {
  TITLES_IDS_MAX,
  type TitlesQueryInput,
  titlesResponse,
} from "../../../../../shared/knowledge-item/contract.js";
import type {
  EvalParams,
  ExpectedResource,
  GoldenRowInput,
  KnowledgeType,
  SweepGrid,
} from "./form";

export type {
  EvalRun,
  GoldenQuery,
  PerQueryResult,
  RunResponse,
  RunsResponse,
  SweepResponse,
};

// 서버 maxDuration(knowledge-eval 60초)보다 조금 길게 잡아 서버 응답을 기다린다.
const RUN_TIMEOUT_MS = 65_000;

export const evalKeys = {
  all: ["admin", "knowledge-evals"] as const,
  runs: (knowledgeType: KnowledgeType) =>
    [...evalKeys.all, "runs", knowledgeType] as const,
  queries: (knowledgeType: KnowledgeType) =>
    [...evalKeys.all, "queries", knowledgeType] as const,
  titles: (ids: string) => [...evalKeys.all, "titles", ids] as const,
};

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
    .json(runsResponse);
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
    .json(runResponse);
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
    .json(sweepResponse);
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
    .json(goldenList);
  return reply.items;
}

export function createGoldenQuery(row: GoldenRowInput): Promise<GoldenQuery> {
  return api
    .post("admin/knowledge-eval/queries", { json: row })
    .json(goldenQuery);
}

/** 질의 수정과 비활성 토글. 유형은 고칠 수 없고 범위(쿼리)로만 보낸다. */
export function patchGoldenQuery(
  id: string,
  knowledgeType: KnowledgeType,
  body: GoldenPatchInput,
): Promise<GoldenQuery> {
  return api
    .patch(`admin/knowledge-eval/queries/${id}`, {
      searchParams: { knowledgeType },
      json: body,
    })
    .json(goldenQuery);
}

export async function searchKnowledgeResources(
  knowledgeType: KnowledgeType,
  term: string,
): Promise<ExpectedResource[]> {
  const q = term.trim();
  if (!q) return [];
  const reply = await api
    .get("admin/knowledge-items/titles", {
      searchParams: { knowledgeType, q } satisfies TitlesQueryInput,
    })
    .json(titlesResponse);
  return reply.items;
}

/** 기대 자료 id 의 제목. 표와 편집 Dialog 에서 id 대신 제목을 보여 준다. 서버 상한마다 나눠 부른다. */
export async function fetchResourceTitles(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let start = 0; start < unique.length; start += TITLES_IDS_MAX) {
    chunks.push(unique.slice(start, start + TITLES_IDS_MAX));
  }
  const replies = await Promise.all(
    chunks.map((chunk) =>
      api
        .get("admin/knowledge-items/titles", {
          searchParams: { ids: chunk.join(",") } satisfies TitlesQueryInput,
          ...(signal ? { signal } : {}),
        })
        .json(titlesResponse),
    ),
  );
  return Object.fromEntries(
    replies.flatMap((reply) => reply.items.map((row) => [row.id, row.title])),
  );
}
