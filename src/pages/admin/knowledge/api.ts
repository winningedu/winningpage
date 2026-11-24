// 지식 DB 관리 화면(엑셀 일괄 등록, 검색 테스트)이 부르는 서버 API 4종.
// react-query 의 mutationFn 으로 쓴다. 실패는 ApiError(message 가 서버 problem 의 detail)를 던지고,
// 응답이 스키마와 다르면 ky SchemaValidationError 를 던진다.

import { z } from "zod";
import { api } from "@/lib/http/client";
import type {
  DedupeItem,
  DedupeResult,
} from "../../../../api/_lib/knowledge/dedupe.js";
import type {
  SearchPreviewBody,
  SearchPreviewItem,
  SearchPreviewMode,
} from "../../../../api/_lib/knowledge/preview.js";
import type { BackfillRound } from "./bulk/backfillLoop";
import type { BulkRequest } from "./bulk/plan";

// 서버 maxDuration(dedupe, admin-embed 60초, search 30초)보다 조금 길게 잡아 서버 응답을 기다린다.
const DEDUPE_TIMEOUT_MS = 65_000;
const EMBED_TIMEOUT_MS = 65_000;
const SEARCH_TIMEOUT_MS = 35_000;

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

export async function postKnowledgeDedupe(request: {
  knowledgeType: string;
  items: DedupeItem[];
}): Promise<DedupeResult[]> {
  const reply = await api
    .post("admin/knowledge-dedupe", {
      json: request,
      timeout: DEDUPE_TIMEOUT_MS,
    })
    .json(dedupeSchema);
  return reply.items;
}

const bulkSchema = z.object({
  inserted: z.number(),
  updated: z.number(),
  ids: z.array(z.string()),
});

export async function postKnowledgeBulk(
  request: BulkRequest,
): Promise<z.infer<typeof bulkSchema>> {
  return api.post("admin/knowledge-bulk", { json: request }).json(bulkSchema);
}

// admin-embed 는 batch B4 가 바꾸지만 embedded, failed 두 필드는 그대로 둔다.
const backfillSchema = z.object({ embedded: z.number(), failed: z.number() });

export async function postEmbedBackfill(): Promise<BackfillRound> {
  return api
    .post("performance/admin-embed", {
      json: { action: "backfill" },
      timeout: EMBED_TIMEOUT_MS,
    })
    .json(backfillSchema);
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
): Promise<SearchPreviewResult> {
  const reply = await api
    .post("admin/knowledge-search", {
      json: body,
      timeout: SEARCH_TIMEOUT_MS,
    })
    .json(searchSchema);
  return reply as SearchPreviewResult;
}
