// GET /api/performance/embed-session-vectors   (Vercel Cron 전용 — 일 1회, POST는 수동 트리거)
// Authorization: Bearer <CRON_SECRET>
// 평가 직후 즉시 임베딩(instantEmbed)이 기본 경로이고 이 크론은 실패분 안전망이다.
//
//   → 200 { ok, ranAt, batchLimit, scanned, embedded, failed, results }
//   → 401 (시크릿 불일치 · 미설정)
//   → 405 (GET/POST 외)
//   → 500 { error:{code:'INTERNAL'} }
//
// ── 이 파일이 하는 일 (P14 — 학생 과거 수행 RAG 비동기 임베딩)
//   `performance_session_vectors`는 `evaluate.js`가 평가 커밋 RPC 호출 직전에
//   `upsertSessionVectorMetadata`(api/_lib/performance/session-vectors.js)로 `search_text`와
//   함께 `embedding_status='pending'` 행을 채워 두는 큐다. RPC(`commit_performance_evaluation_report`/
//   `finalize_performance_submission`, sql/58_performance_submission.sql)는 그 행의 `rag_use`만
//   승격한다. 이 cron은 그 큐를 소비해 `embedding`을 채우는 유일한 실행부다.
//
//   **왜 pending만 도는가** — content_hash 기반 "무변경이면 재임베딩 스킵" 게이팅은
//   upsert 쪽(RPC)의 책임이고, 여기는 그 결과로 이미 큐에 올라온 pending 신호만
//   소비한다. 이 파일이 content_hash를 직접 비교하는 순간 게이팅 로직이 두 곳에
//   중복되고 어긋날 여지가 생긴다.
//
// ── 인증 — cleanup-attachments.js가 세운 CRON_SECRET fail-closed 관례를 그대로 쓴다.
//   새로 짜지 않고 `../_lib/cronAuth.js`의 `isAuthorizedCron`을 재사용한다(그 파일
//   상단 주석: "cleanup-attachments.js가 정본 구현이었고 여기로 추출했다").
//
// ── 배치 상수 (admin-embed.js와 같은 근거)
//   Gemini `embedContent` 호출 1건당 수백ms~수초가 걸리고, Vercel Hobby `maxDuration`
//   상한이 60초다. `DEFAULT_BATCH = 30` / `MAX_BATCH = 50`은 admin-embed.js의 백필
//   상수를 그대로 승계한다 — 같은 Gemini 임베딩 호출이 배치로 도는 동일한 제약이라
//   여기서 새 숫자를 만들 이유가 없다. `?limit=` 쿼리로 조절 가능하다(admin-embed.js
//   `clampLimit` 패턴).
//
// ── hasMore 판정 — admin-embed.js backfill() 관례를 따른다 (cleanup-attachments.js 아님)
//   cleanup-attachments.js는 `limit(batch+1)`로 떠서 `found.length > batch`로 hasMore를
//   판정하지만, 그건 Storage remove 실패로 "찍었어야 할 deleted_at을 못 찍는" 부분
//   실패가 배치 앞자리를 영구 점유할 수 있어(head-of-line blocking) 적체 여부를
//   명시적으로 노출해야 하는 사정 때문이다(cleanup_attempts 상한과 세트로 설계됨).
//   이 파일은 그 사정이 없다 — Storage를 전혀 건드리지 않는 순수 상태 전이
//   (pending → done/error) 배치이고, admin-embed.js backfill()과 성격이 같다
//   (지식 항목 임베딩도 Storage 없이 DB 컬럼만 갱신). admin-embed.js backfill()도
//   `limit(batch+1)` 오버페치나 명시적 `hasMore` 필드 없이 `.limit(limit)`만 쓰고,
//   "반복 호출을 전제로 정렬만 보장한다"(그 파일 backfill() 주석)는 방식으로 적체를
//   흡수한다 — 실패 행도 `embedding_status='error'`로 큐에서 빠지므로(재시도는
//   `admin-embed`의 force 백필처럼 별도 운영 조작 몫) 이 cron이 매일 오래된
//   pending부터 걷어내는 것만으로 수렴한다. 새 3번째 관례(오버페치+hasMore)를
//   만들지 않고 이쪽을 택했다.
//
// ── 한 행의 실패가 배치를 막지 않는다 (admin-embed.js backfill()과 동일 규율)
//   행별로 try/catch를 감싸 실패를 격리한다. 실패 기록(`embedding_status='error'`)
//   자체가 또 실패해도 로그만 남기고 원래 루프는 계속 돈다.

import { performanceTraceContext } from "../_lib/aiTelemetry/performanceContext.js";
import { type AiTrace, createAiTrace } from "../_lib/aiTelemetry/trace.js";
import { defineHandler } from "../_lib/handler.js";
import {
  embedText,
  getEmbeddingModel,
} from "../_lib/performance/embeddings.js";
import type { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";

const TABLE = "performance_session_vectors";

// admin-embed.js DEFAULT_BACKFILL_LIMIT / MAX_BACKFILL_LIMIT과 같은 근거(파일 상단 주석).
const DEFAULT_BATCH = 30;
const MAX_BATCH = 50;

function clampLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_BATCH);
}

function errorMessage(error: unknown) {
  return String(
    (error as { message?: string })?.message ||
      error ||
      "알 수 없는 임베딩 오류",
  );
}

type SessionVectorRow = { session_id: string; search_text: string };

/**
 * 실패 사유를 행에 남긴다. admin-embed.js `markEmbeddingError`와 같은 규율 —
 * 이 갱신 자체가 실패해도 원래 예외를 삼키지 않고 로그만 남긴다(루프를 막지 않는다).
 */
async function markEmbeddingError(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  sessionId: string,
  message: string,
) {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({
      embedding_status: "error",
      embedding_error: message.slice(0, 2000),
    })
    .eq("session_id", sessionId);

  if (error) {
    console.error(
      "embed-session-vectors: embedding_error 기록 실패",
      sessionId,
      error.message,
    );
  }
}

/**
 * pending 벡터 1건 임베딩. 실패는 던지고, 호출부가 카운트·기록을 담당한다.
 */
async function embedOne(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  row: SessionVectorRow,
  telemetry?: AiTrace,
) {
  const model = getEmbeddingModel();

  try {
    const embedding = await embedText(row.search_text, telemetry);

    const { error: updateError } = await supabaseAdmin
      .from(TABLE)
      .update({
        // pgvector 컬럼: 생성 타입이 확장 타입을 몰라 string으로 나오지만
        // supabase-js는 number[]를 그대로 직렬화해 정상 저장한다.
        embedding: embedding as unknown as string,
        embedding_model: model,
        embedding_status: "done",
        embedding_error: null,
        embedded_at: new Date().toISOString(),
      })
      .eq("session_id", row.session_id);

    if (updateError) {
      throw new Error(`임베딩 저장 실패: ${updateError.message}`);
    }

    return {
      session_id: row.session_id,
      status: "embedded",
      embedding_model: model,
    };
  } catch (error) {
    await markEmbeddingError(
      supabaseAdmin,
      row.session_id,
      errorMessage(error),
    );
    throw error;
  }
}

export default defineHandler({
  // Vercel Cron은 GET으로 호출한다. POST는 운영자가 손으로 두드릴 때를 위한 것이며
  // 인증은 동일하다(cleanup-attachments.js와 같은 규약).
  methods: ["GET", "POST"],
  auth: "cron",
  errorShape: "coded",
  methodNotAllowedMessage: "GET 또는 POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "세션 벡터 임베딩에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/embed-session-vectors",
  handler: async (req, res, ctx) => {
    const batch = clampLimit(req.query?.limit);
    const supabaseAdmin = ctx.supabaseAdmin;
    const now = Date.now();

    // pending만 대상 — content_hash 게이팅은 upsert 쪽(RPC) 책임이고 여기는 신호만
    // 소비한다(파일 상단 주석). 오래된 것부터 걷어 큐가 확정적으로 줄어든다.
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("session_id, search_text")
      .eq("embedding_status", "pending")
      .order("created_at", { ascending: true })
      .limit(batch);

    if (error) {
      throw new Error(`대상 조회 실패: ${error.message}`);
    }

    const rows: SessionVectorRow[] = data || [];
    let embedded = 0;
    let failed = 0;
    const results: Array<Record<string, unknown>> = [];

    // 계기판 기록. 배치 하나에 trace 하나이고 행별 실패는 루프가 흡수한다.
    const trace = createAiTrace(
      performanceTraceContext({ feature: "session_vectors" }),
    );

    for (const row of rows) {
      try {
        const result = await embedOne(supabaseAdmin, row, trace);
        embedded += 1;
        results.push(result);
      } catch (itemError) {
        // 한 행의 실패가 배치 전체를 멈추지 않는다 — 카운트만 올리고 다음 행으로.
        failed += 1;
        results.push({
          session_id: row.session_id,
          status: "error",
          reason: errorMessage(itemError),
        });
        console.error(
          "performance/embed-session-vectors 행 실패:",
          row.session_id,
          itemError,
        );
      }
    }

    await trace.flush(supabaseAdmin);

    res.status(200).json({
      ok: failed === 0,
      ranAt: new Date(now).toISOString(),
      batchLimit: batch,
      scanned: rows.length,
      embedded,
      failed,
      results,
    });
  },
});

// Gemini 호출이 붙어 있어 기본 10초로는 배치가 잘린다(1건당 수백ms~수초 × 최대
// 50건). maxDuration은 Vercel Hobby 상한 60초를 그대로 쓴다(admin-embed.js와 동일).
export const config = { runtime: "nodejs", maxDuration: 60 };
