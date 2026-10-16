// 지식 DB 관리 화면(엑셀 일괄 등록, 검색 테스트)이 부르는 서버 API 4종.
// 모든 함수는 예외를 던지지 않는다. 실패도 ApiResult(apiResult.ts)로 돌려준다.
//   중복 검사, 일괄 반영, 검색 테스트: coded 형식({ ok } 또는 { error: { message } })
//   임베딩 backfill: admin-embed 의 detail 형식({ detail })

import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
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

type JsonReply = {
  response: Response;
  result: Record<string, unknown> | null;
};

// 세션 토큰 조회와 fetch 의 예외도 던지지 않고 그 메시지를 ok:false 로 돌려준다.
async function postJson(
  url: string,
  body: unknown,
): Promise<ApiResult<JsonReply>> {
  try {
    const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    return { ok: true, data: { response, result } };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function failureMessage({ response, result }: JsonReply): string {
  const error = result?.error as { message?: unknown } | undefined;
  const message =
    error?.message ??
    result?.detail ??
    `요청에 실패했습니다. (HTTP ${response.status})`;
  return String(message);
}

/** coded 형식 응답. HTTP 상태와 본문 ok 가 모두 참이어야 성공이다. */
async function postCoded(
  url: string,
  body: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  const reply = await postJson(url, body);
  if (!reply.ok) return reply;
  const { response, result } = reply.data;
  if (!response.ok || !result?.ok)
    return { ok: false, message: failureMessage(reply.data) };
  return { ok: true, data: result };
}

/** detail 형식 응답. HTTP 상태만 본다. */
async function postDetail(
  url: string,
  body: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  const reply = await postJson(url, body);
  if (!reply.ok) return reply;
  if (!reply.data.response.ok)
    return { ok: false, message: failureMessage(reply.data) };
  return { ok: true, data: reply.data.result ?? {} };
}

export async function postKnowledgeDedupe(
  knowledgeType: string,
  items: DedupeItem[],
): Promise<ApiResult<DedupeResult[]>> {
  const reply = await postCoded("/api/admin/knowledge-dedupe", {
    knowledgeType,
    items,
  });
  if (!reply.ok) return reply;
  return { ok: true, data: reply.data.results as DedupeResult[] };
}

type BulkApplyResult = {
  inserted: number;
  updated: number;
  ids: string[];
};

export async function postKnowledgeBulk(
  request: BulkRequest,
): Promise<ApiResult<BulkApplyResult>> {
  const reply = await postCoded("/api/admin/knowledge-bulk", request);
  if (!reply.ok) return reply;
  const { inserted, updated, ids } = reply.data as BulkApplyResult;
  return { ok: true, data: { inserted, updated, ids } };
}

export async function postEmbedBackfill(): Promise<ApiResult<BackfillRound>> {
  const reply = await postDetail("/api/performance/admin-embed", {
    action: "backfill",
  });
  if (!reply.ok) return reply;
  return {
    ok: true,
    data: {
      embedded: Number(reply.data.embedded ?? 0),
      failed: Number(reply.data.failed ?? 0),
    },
  };
}

export type SearchPreviewResult = {
  mode: SearchPreviewMode;
  threshold: number;
  queryText: string;
  /** hybrid 일 때 RPC 에 넘긴 단어 질의. vector 면 null. */
  keywordQuery: string | null;
  items: SearchPreviewItem[];
};

export async function postSearchPreview(
  body: Omit<SearchPreviewBody, "includeOtherSubjects" | "limit" | "mode"> &
    Partial<Pick<SearchPreviewBody, "includeOtherSubjects" | "limit" | "mode">>,
): Promise<ApiResult<SearchPreviewResult>> {
  const reply = await postCoded("/api/admin/knowledge-search", body);
  if (!reply.ok) return reply;
  const result = reply.data;
  return {
    ok: true,
    data: {
      mode: result.mode === "vector" ? "vector" : "hybrid",
      threshold: Number(result.threshold),
      queryText: String(result.queryText ?? ""),
      keywordQuery:
        typeof result.keywordQuery === "string" ? result.keywordQuery : null,
      items: result.items as SearchPreviewItem[],
    },
  };
}
