// 지식 DB 엑셀 일괄 등록 화면이 부르는 서버 API 3종.
//   중복 검사, 일괄 반영: coded 형식({ ok } 또는 { error: { message } })
//   임베딩 backfill: admin-embed 의 detail 형식({ detail })

import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
import type {
  DedupeItem,
  DedupeResult,
} from "../../../../api/_lib/performance/knowledgeDedupe.js";
import type { BackfillRound } from "./backfillLoop";
import type { BulkRequest } from "./knowledgeBulkPlan";

async function postJson(
  url: string,
  body: unknown,
): Promise<{ response: Response; result: Record<string, unknown> | null }> {
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
  return { response, result };
}

function failureMessage(
  response: Response,
  result: Record<string, unknown> | null,
): string {
  const error = result?.error as { message?: unknown } | undefined;
  const message =
    error?.message ??
    result?.detail ??
    `요청에 실패했습니다. (HTTP ${response.status})`;
  return String(message);
}

export async function postKnowledgeDedupe(
  knowledgeType: string,
  items: DedupeItem[],
): Promise<DedupeResult[]> {
  const { response, result } = await postJson(
    "/api/performance/admin-knowledge-dedupe",
    { knowledgeType, items },
  );
  if (!response.ok || !result?.ok)
    throw new Error(failureMessage(response, result));
  return result.results as DedupeResult[];
}

export async function postKnowledgeBulk(
  request: BulkRequest,
): Promise<{ inserted: number; updated: number; ids: string[] }> {
  const { response, result } = await postJson(
    "/api/performance/admin-knowledge-bulk",
    request,
  );
  if (!response.ok || !result?.ok)
    throw new Error(failureMessage(response, result));
  return result as unknown as {
    inserted: number;
    updated: number;
    ids: string[];
  };
}

export async function postEmbedBackfill(): Promise<BackfillRound> {
  const { response, result } = await postJson("/api/performance/admin-embed", {
    action: "backfill",
  });
  if (!response.ok) throw new Error(failureMessage(response, result));
  return {
    embedded: Number(result?.embedded ?? 0),
    failed: Number(result?.failed ?? 0),
  };
}
