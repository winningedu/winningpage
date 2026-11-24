// 지식 DB 관리 화면(엑셀 일괄 등록, 검색 테스트)이 부르는 서버 API 4종.
// 모든 함수는 예외를 던지지 않는다. 실패도 ApiResult(apiResult.ts)로 돌려준다.
// 실패 메시지는 서버가 준 problem 의 detail(ApiError)이다. 응답이 스키마와 다르면 그 예외 메시지다.

import { z } from "zod";
import { ApiError, api } from "@/lib/http/client";
import type {
  DedupeItem,
  DedupeResult,
} from "../../../../api/_lib/knowledge/dedupe.js";
import type {
  SearchPreviewBody,
  SearchPreviewItem,
  SearchPreviewMode,
} from "../../../../api/_lib/knowledge/preview.js";
import type { ApiResult } from "./apiResult";
import type { BackfillRound } from "./bulk/backfillLoop";
import type { BulkRequest } from "./bulk/plan";

// 서버 maxDuration(dedupe, admin-embed 60초, search 30초)보다 조금 길게 잡아 서버 응답을 기다린다.
const DEDUPE_TIMEOUT_MS = 65_000;
const EMBED_TIMEOUT_MS = 65_000;
const SEARCH_TIMEOUT_MS = 35_000;

async function settle<T>(request: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await request() };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, message: error.detail };
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

const dedupeSchema = z.object({
  items: z.array(
    z.object({
      rowNo: z.number(),
      exact: z.array(z.object({ id: z.string(), title: z.string() })),
      near: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          similarity: z.number(),
        }),
      ),
    }),
  ),
});

export async function postKnowledgeDedupe(
  knowledgeType: string,
  items: DedupeItem[],
): Promise<ApiResult<DedupeResult[]>> {
  return settle(async () => {
    const reply = await api
      .post("admin/knowledge-dedupe", {
        json: { knowledgeType, items },
        timeout: DEDUPE_TIMEOUT_MS,
      })
      .json(dedupeSchema);
    return reply.items;
  });
}

const bulkSchema = z.object({
  inserted: z.number(),
  updated: z.number(),
  ids: z.array(z.string()),
});

export async function postKnowledgeBulk(
  request: BulkRequest,
): Promise<ApiResult<z.infer<typeof bulkSchema>>> {
  return settle(async () => {
    const { inserted, updated, ids } = await api
      .post("admin/knowledge-bulk", { json: request })
      .json(bulkSchema);
    return { inserted, updated, ids };
  });
}

// admin-embed 는 batch B4 가 바꾸지만 embedded, failed 두 필드는 그대로 둔다.
const backfillSchema = z.object({ embedded: z.number(), failed: z.number() });

export async function postEmbedBackfill(): Promise<ApiResult<BackfillRound>> {
  return settle(async () => {
    const { embedded, failed } = await api
      .post("performance/admin-embed", {
        json: { action: "backfill" },
        timeout: EMBED_TIMEOUT_MS,
      })
      .json(backfillSchema);
    return { embedded, failed };
  });
}

export type SearchPreviewResult = {
  mode: SearchPreviewMode;
  threshold: number;
  queryText: string;
  /** hybrid 일 때 RPC 에 넘긴 단어 질의. vector 면 null. */
  keywordQuery: string | null;
  items: SearchPreviewItem[];
};

const searchSchema = z.object({
  mode: z.enum(["vector", "hybrid"]),
  threshold: z.number(),
  queryText: z.string(),
  keywordQuery: z.string().nullable(),
  items: z.array(
    z.looseObject({
      rank: z.number(),
      id: z.string(),
      title: z.string(),
      grade: z.string(),
      subject: z.string(),
      career_field: z.string(),
      similarity: z.number(),
      passesThreshold: z.boolean(),
      wouldBeInjected: z.boolean(),
      semanticRank: z.number().nullish(),
      keywordRank: z.number().nullish(),
      rrfScore: z.number().nullish(),
    }),
  ),
});

export async function postSearchPreview(
  body: Omit<SearchPreviewBody, "includeOtherSubjects" | "limit" | "mode"> &
    Partial<Pick<SearchPreviewBody, "includeOtherSubjects" | "limit" | "mode">>,
): Promise<ApiResult<SearchPreviewResult>> {
  return settle(async () => {
    const reply = await api
      .post("admin/knowledge-search", {
        json: body,
        timeout: SEARCH_TIMEOUT_MS,
      })
      .json(searchSchema);
    return reply as SearchPreviewResult;
  });
}
