// 평가 직후 세션 벡터 1건 즉시 임베딩(모더나이즈 계획 P5, 검토 문서 2026-10-07).
//
// evaluate 가 응답을 보낸 뒤 waitUntil 로 이 함수를 돌려, 같은 날 다음 수행평가의
// 과거 수행 검색에 직전 기록이 바로 잡히게 한다. 매일 도는 크론
// `api/performance/embed-session-vectors.ts` 는 무수정으로 두고 안전망으로 쓴다.
//
// 실패 규칙. 임베딩이나 저장이 실패해도 행을 'error' 로 바꾸지 않고 'pending' 그대로 둔다.
// 크론은 pending 행만 소비하므로 여기서 error 로 찍으면 안전망이 그 행을 다시 잡지 못한다.
// 실패는 console.warn 으로만 남기고 failed 를 돌려준다. 어떤 경우에도 throw 하지 않는다.
//
// 덮어쓰기 방지. done 기록은 세션, pending 상태, 처음 읽은 search_text 가 모두 같을 때만 한다.
// 그 사이 재평가로 search_text 가 바뀌었거나 크론이 먼저 처리했으면 0행이 갱신되고
// superseded 로 건너뛴다.

import type { createSupabaseAdmin } from "../supabaseAdmin.js";
import type { AiTrace } from "../telemetry/trace.js";
import { embedText, getEmbeddingModel } from "./embeddings.js";

const TABLE = "performance_session_vectors";

export type InstantEmbedResult = {
  status: "embedded" | "skipped" | "failed";
  reason?: string;
};

type Deps = { embed?: typeof embedText; telemetry?: AiTrace };

function errorMessage(error: unknown): string {
  return String((error as { message?: string })?.message || error);
}

export async function embedSessionVectorNow(
  db: ReturnType<typeof createSupabaseAdmin>,
  sessionId: string,
  deps: Deps = {},
): Promise<InstantEmbedResult> {
  try {
    return await embedPendingRow(db, sessionId, deps);
  } catch (error) {
    // 행은 pending 그대로 둔다. 크론 안전망이 다음 회차에 다시 잡는다(파일 상단 주석).
    const reason = errorMessage(error);
    console.warn(
      "[instant-embed] 세션 벡터 즉시 임베딩 실패:",
      sessionId,
      reason,
    );
    return { status: "failed", reason };
  }
}

async function embedPendingRow(
  db: ReturnType<typeof createSupabaseAdmin>,
  sessionId: string,
  deps: Deps,
): Promise<InstantEmbedResult> {
  const embed = deps.embed ?? embedText;

  const { data: row, error: selectError } = await db
    .from(TABLE)
    .select("search_text, embedding_status")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (selectError) throw new Error(`조회 실패: ${selectError.message}`);
  if (!row) return { status: "skipped", reason: "not_found" };
  if (row.embedding_status !== "pending") {
    return { status: "skipped", reason: "not_pending" };
  }

  const searchText = row.search_text;
  // 빈 텍스트는 임베딩할 수 없다. 행은 pending 그대로 두고 크론 판정에 맡긴다.
  if (!searchText) return { status: "skipped", reason: "empty_search_text" };
  const embedding = await embed(searchText, deps.telemetry);

  const { data: updated, error: updateError } = await db
    .from(TABLE)
    .update({
      // pgvector 컬럼: 생성 타입이 확장 타입을 몰라 string 으로 나오지만
      // supabase-js 는 number[] 를 그대로 직렬화해 정상 저장한다.
      embedding: embedding as unknown as string,
      embedding_model: getEmbeddingModel(),
      embedding_status: "done",
      embedding_error: null,
      embedded_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId)
    .eq("embedding_status", "pending")
    .eq("search_text", searchText)
    .select("session_id");

  if (updateError) throw new Error(`임베딩 저장 실패: ${updateError.message}`);
  // 0행이면 그 사이 search_text 가 바뀌었거나 크론이 먼저 처리한 것이다.
  if (!updated || updated.length === 0) {
    return { status: "skipped", reason: "superseded" };
  }

  return { status: "embedded" };
}
