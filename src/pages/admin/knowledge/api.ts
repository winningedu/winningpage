// 지식 DB 관리 화면(엑셀 일괄 등록, 검색 테스트)이 부르는 서버 API 4종.
// react-query 의 mutationFn 으로 쓴다. 실패는 ApiError(message 가 서버 problem 의 detail)를 던지고,
// 응답이 스키마와 다르면 ky SchemaValidationError 를 던진다.

import { z } from "zod";
import { api } from "@/lib/http/client";
import {
  type DedupeResult,
  type KnowledgeBulkResult,
  knowledgeBulkResultSchema,
  knowledgeDedupeResultSchema,
  type SearchPreviewResult,
  searchPreviewResultSchema,
} from "../../../../shared/knowledge/contract.js";
import type {
  KnowledgeBulkInput,
  KnowledgeDedupeInput,
  KnowledgeSearchInput,
} from "../../../../shared/knowledge/request.js";
import type { BackfillRound } from "./bulk/backfillLoop";

// 서버 maxDuration(dedupe, admin-embed 60초, search 30초)보다 조금 길게 잡아 서버 응답을 기다린다.
const DEDUPE_TIMEOUT_MS = 65_000;
const EMBED_TIMEOUT_MS = 65_000;
const SEARCH_TIMEOUT_MS = 35_000;

export async function postKnowledgeDedupe(
  request: KnowledgeDedupeInput,
): Promise<DedupeResult[]> {
  const reply = await api
    .post("admin/knowledge-dedupe", {
      json: request,
      timeout: DEDUPE_TIMEOUT_MS,
    })
    .json(knowledgeDedupeResultSchema);
  return reply.items;
}

export async function postKnowledgeBulk(
  request: KnowledgeBulkInput,
): Promise<KnowledgeBulkResult> {
  return api
    .post("admin/knowledge-bulk", { json: request })
    .json(knowledgeBulkResultSchema);
}

// admin-embed 는 batch B4 가 바꾸지만 embedded, failed 두 필드는 그대로 둔다.
const backfillSchema = z.object({ embedded: z.number(), failed: z.number() });

export async function postEmbedBackfill(
  knowledgeType: string,
): Promise<BackfillRound> {
  return api
    .post("performance/admin-embed", {
      json: { action: "backfill", knowledgeType },
      timeout: EMBED_TIMEOUT_MS,
    })
    .json(backfillSchema);
}

export type { SearchPreviewResult };

export async function postSearchPreview(
  body: KnowledgeSearchInput,
): Promise<SearchPreviewResult> {
  return api
    .post("admin/knowledge-search", {
      json: body,
      timeout: SEARCH_TIMEOUT_MS,
    })
    .json(searchPreviewResultSchema);
}
