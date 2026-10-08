// POST /api/performance/admin-embed
// Authorization: Bearer <supabase access token>   (관리자 = is_admin() 미러)
//
// 수행평가 RAG 지식베이스(`winning_assessment_knowledge_items`)의 임베딩을
// 생성·갱신하는 유일한 진입점이다. 어드민이 지식 항목을 저장할 때 호출한다.
//
// 이 라우트가 대체하는 것
//   기존에는 브라우저(src/pages/Admin.jsx)가 외부 도메인의 `/api/admin-embeddings`를
//   직접 치고, `api/request-winning-embedding.js`가 `ADMIN_EMBED_SECRET` 헤더로
//   같은 외부 엔드포인트에 프록시했다. 외부 앱은 폐기 대상이므로 임베딩을 이
//   저장소에서 자립 수행한다. 외부 앱에 있던 **`x-admin-secret` 우회 인증**,
//   CORS 화이트리스트, 이중 Supabase 클라이언트 팩토리는 이식하지 않는다
//   (같은 오리진에서만 부르므로 CORS가 필요 없고, 시크릿 헤더는 Bearer 판정을
//   통째로 건너뛰는 두 번째 문이라 없애는 편이 낫다).
//   근거: docs/수행평가-상세-명세.md §8.7 「제안(임베딩 경로 정리)」, §12.3 / §12.4
//
// 요청 규격
//   { action: 'embed-one', id, force? }        1건 임베딩
//   { action: 'backfill', limit?, force? }      배치 임베딩 (limit 기본 30, 상한 50)
//
// 응답 규격
//   200 { action, ... }   정상. 대상 아님/캐시 적중은 에러가 아니라 status:'skipped'다.
//   400 { detail }        action·id 누락 등 요청 오류.
//   401 { detail }        토큰 없음/무효.
//   403 { detail }        관리자 아님.
//   405 { detail }        POST 아님.
//   500 { detail }        임베딩 실패, 서버 설정 누락 등.

import { defineHandler } from "../_lib/handler.js";
import {
  buildKnowledgeSearchText,
  embedText,
  getEmbeddingDimension,
  getEmbeddingModel,
} from "../_lib/performance/embeddings.js";
import type { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";
import { performanceTraceContext } from "../_lib/telemetry/performanceContext.js";
import { type AiTrace, createAiTrace } from "../_lib/telemetry/trace.js";

const KNOWLEDGE_TABLE = "winning_assessment_knowledge_items";

// 임베딩 대상 화이트리스트. `student_record_pattern`이 빠진 것은 누락이 아니라
// "저장은 하되 수행평가 RAG에는 안 쓴다"는 구분이다 — RPC
// `match_winning_suhaeng_all_subjects`도 같은 2종으로 하드 제한한다
// (sql/53_performance.sql (3-b), 명세서 §8.7 말미).
const RAG_KNOWLEDGE_TYPES = new Set(["topic_pattern", "verified_resource"]);

const DEFAULT_BACKFILL_LIMIT = 30;
const MAX_BACKFILL_LIMIT = 50;

// 빌더에 들어가는 컬럼 + 캐시 판정에 필요한 컬럼만 명시한다.
// `select('*')`를 쓰지 않는 이유: 768차원 `embedding` 벡터를 매번 통째로 끌어오게
// 되는데, 캐시 판정에는 "null인가"만 필요하다. PostgREST로 그 판정만 따로 받을
// 방법이 없어 embed-one 1건에서는 어쩔 수 없이 함께 받지만(아래 SELECT_COLUMNS),
// 백필 목록 조회에서는 id만 받아 배치 전송량을 줄인다.
const SELECT_COLUMNS = [
  "id",
  "knowledge_type",
  "grade",
  "subject",
  "career_field",
  "title",
  "content",
  "source",
  "source_link",
  // `keywords`는 어드민 폼에 입력 필드가 없어 쓰기 경로가 없지만, 빌더의
  // `키워드:` 줄이 참조하므로 반드시 받아야 한다. 빠뜨리면 값이 있는 행에서도
  // 빈 문자열로 조립돼 저장된 `search_text`와 공식이 어긋나고, 정확 일치 캐시가
  // 영구 미스가 된다(외부 라이브 엔드포인트는 `select('*')`라 늘 포함됐다).
  "keywords",
  "memo",
  "search_text",
  "embedding",
  "embedding_model",
  "embedding_status",
  "embedded_at",
].join(",");

type KnowledgeItemRow = {
  id: string;
  knowledge_type: string | null;
  grade: string | null;
  subject: string | null;
  career_field: string | null;
  title: string | null;
  content: string | null;
  source: string | null;
  source_link: string | null;
  keywords: string | null;
  memo: string | null;
  search_text: string | null;
  embedding: unknown;
  embedding_model: string | null;
  embedding_status: string | null;
  embedded_at: string | null;
};

function clampLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BACKFILL_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_BACKFILL_LIMIT);
}

function errorMessage(error: unknown) {
  return String(
    (error as { message?: string })?.message ||
      error ||
      "알 수 없는 임베딩 오류",
  );
}

/**
 * 실패 사유를 행에 남긴다.
 *
 * 이 기록이 없으면 임베딩이 실패한 행은 `embedding_status='pending'`에 머무른
 * 채로 다음 백필에 다시 걸리고, 왜 실패했는지는 서버 로그에만 남는다. 어드민
 * 목록에서 원인을 볼 수 있도록 상태와 사유를 함께 적는다(외부 앱
 * `api/admin-embeddings.js:256-264`와 같은 방식).
 *
 * 이 갱신 자체가 또 실패해도 원래 예외를 덮지 않는다 — 삼키고 로그만 남긴다.
 */
async function markEmbeddingError(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  id: string,
  message: string,
) {
  const { error } = await supabaseAdmin
    .from(KNOWLEDGE_TABLE)
    .update({
      embedding_status: "error",
      embedding_error: message.slice(0, 2000),
    })
    .eq("id", id);

  if (error) {
    console.error("admin-embed: embedding_error 기록 실패", id, error.message);
  }
}

/**
 * 지식 항목 1건 임베딩.
 *
 * @returns status: 'embedded' | 'skipped' | 'not_found'
 * @throws 조회·임베딩·저장 실패 (호출부가 500으로 변환)
 */
async function embedOne(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  id: string,
  {
    force = false,
    telemetry,
  }: { force?: boolean; telemetry?: AiTrace | undefined } = {},
) {
  const { data: itemData, error: fetchError } = await supabaseAdmin
    .from(KNOWLEDGE_TABLE)
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`지식 항목 조회 실패: ${fetchError.message}`);
  }

  // `SELECT_COLUMNS`가 런타임 조립 문자열이라 supabase-js가 리터럴 파싱 기반 열
  // 추론을 못 하고 `GenericStringError`로 떨어진다 — select 목록과 KnowledgeItemRow
  // 필드는 위 상수와 정확히 대응하므로 안전한 캐스트다.
  const item = itemData as unknown as KnowledgeItemRow | null;

  if (!item) {
    return { id, status: "not_found", reason: "지식 항목을 찾을 수 없습니다." };
  }

  if (!RAG_KNOWLEDGE_TYPES.has(String(item.knowledge_type || ""))) {
    return {
      id,
      status: "skipped",
      knowledge_type: item.knowledge_type,
      reason: `수행평가 RAG 대상 knowledge_type이 아닙니다: ${item.knowledge_type}`,
    };
  }

  // KnowledgeItemRow는 DB에서 null로 오지만 빌더는 값을 `|| ""`로 다뤄 동일하게 처리된다.
  const searchText = buildKnowledgeSearchText({
    knowledge_type: item.knowledge_type || "",
    grade: item.grade || "",
    subject: item.subject || "",
    career_field: item.career_field || "",
    title: item.title || "",
    content: item.content || "",
    source: item.source || "",
    source_link: item.source_link || "",
    keywords: item.keywords || "",
    memo: item.memo || "",
  });

  // 재호출 방지 캐시 — 저장 버튼을 여러 번 눌러도 Gemini 비용이 반복되지 않게 한다.
  // 비교는 `search_text` **문자열 정확 일치**다. 따라서 빌더 공식이 바뀌면 기존
  // 행은 전부 캐시 미스가 되며, 그게 정상 동작이다(바뀐 공식으로 다시 태워야 한다).
  if (
    !force &&
    item.embedding &&
    item.embedding_status === "done" &&
    String(item.search_text || "") === searchText
  ) {
    return {
      id,
      status: "skipped",
      reason: "이미 같은 내용으로 임베딩되어 있습니다.",
      knowledge_type: item.knowledge_type,
      title: item.title || "",
      embedding_model: item.embedding_model || "",
      embedded_at: item.embedded_at || null,
    };
  }

  const model = getEmbeddingModel();

  try {
    const embedding = await embedText(searchText, telemetry);

    const { error: updateError } = await supabaseAdmin
      .from(KNOWLEDGE_TABLE)
      .update({
        search_text: searchText,
        // pgvector 컬럼: 생성 타입이 확장 타입을 몰라 string으로 나오지만
        // supabase-js는 number[]를 그대로 직렬화해 정상 저장한다.
        embedding: embedding as unknown as string,
        embedding_model: model,
        embedding_status: "done",
        embedding_error: null,
        embedded_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(`임베딩 저장 실패: ${updateError.message}`);
    }

    return {
      id,
      status: "embedded",
      knowledge_type: item.knowledge_type,
      title: item.title || "",
      embedding_model: model,
      embedding_dimension: embedding.length,
    };
  } catch (error) {
    await markEmbeddingError(supabaseAdmin, id, errorMessage(error));
    throw error;
  }
}

/**
 * 배치 임베딩.
 *
 * force 계약
 *   false(기본) — `embedding is null` 또는 `embedding_status in ('pending','error')`
 *                 인 행만 대상. 평상시 운영용이다.
 *   true        — knowledge_type만 맞으면 `done` 행도 포함해 **무조건 재임베딩**한다.
 *                 빌더 공식이나 임베딩 모델을 바꾼 뒤 코퍼스 전량을 다시 태우는
 *                 수단이다(api/_lib/performance/embeddings.js 상단 경고 참고).
 *
 * 정렬은 `embedded_at` 오름차순 nulls first — 한 번도 임베딩되지 않은 행이 먼저,
 * 그다음 가장 오래된 행 순이다. force 모드에서 이 정렬이 **없으면 같은 앞쪽 N건만
 * 무한 반복**된다(재임베딩해도 대상 집합이 줄지 않기 때문). 임베딩에 성공하면
 * `embedded_at`이 now로 밀려 뒤로 가므로, 같은 요청을 반복 호출하는 것만으로
 * 코퍼스를 한 바퀴 훑을 수 있다.
 *
 * 한 건이 실패해도 배치를 중단하지 않는다 — 실패는 `failed`로 집계하고 사유를
 * `results`에 담아 계속 진행한다(한 행의 오류가 나머지 전부를 막지 않도록).
 * 다만 계속 실패하는 행은 `embedded_at`이 갱신되지 않아 매 호출마다 앞자리를
 * 차지한다. 그 행은 `embedding_error`를 보고 손으로 처리해야 한다.
 */
async function backfill(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  {
    limit,
    force,
    telemetry,
  }: { limit: number; force: boolean; telemetry?: AiTrace | undefined },
) {
  let query = supabaseAdmin
    .from(KNOWLEDGE_TABLE)
    .select("id")
    .in("knowledge_type", [...RAG_KNOWLEDGE_TYPES]);

  if (!force) {
    query = query.or(
      "embedding.is.null,embedding_status.eq.pending,embedding_status.eq.error",
    );
  }

  const { data: rows, error } = await query
    .order("embedded_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    throw new Error(`백필 대상 조회 실패: ${error.message}`);
  }

  let embedded = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows || []) {
    try {
      const result = await embedOne(supabaseAdmin, row.id, {
        force,
        telemetry,
      });

      if (result.status === "embedded") embedded += 1;
      else skipped += 1;

      results.push(result);
    } catch (itemError) {
      failed += 1;
      results.push({
        id: row.id,
        status: "error",
        reason: errorMessage(itemError),
      });
    }
  }

  return {
    requested_limit: limit,
    force,
    total: rows?.length || 0,
    embedded,
    skipped,
    failed,
    results,
  };
}

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "detail",
  unhandledMessage: "임베딩 처리 중 오류가 발생했습니다.",
  logLabel: "admin-embed",
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const { action = "embed-one", id, limit, force = false } = req.body || {};
    const forceFlag = force === true || force === "true";

    // 계기판 기록. 요청 하나에 trace 하나이고, 응답 뒤 finally 에서 한 번 내보낸다.
    const trace = createAiTrace(
      performanceTraceContext(
        action === "backfill"
          ? { feature: "embed_backfill" }
          : {
              feature: "embed_one",
              targetKind: "knowledge_item",
              targetId: typeof id === "string" ? id : null,
            },
      ),
    );

    try {
      if (action === "embed-one") {
        if (!id) {
          res.status(400).json({ detail: "id가 필요합니다." });
          return;
        }

        const result = await embedOne(supabaseAdmin, id, {
          force: forceFlag,
          telemetry: trace,
        });
        res.status(200).json({ action, ...result });
        return;
      }

      if (action === "backfill") {
        const result = await backfill(supabaseAdmin, {
          limit: clampLimit(limit ?? DEFAULT_BACKFILL_LIMIT),
          force: forceFlag,
          telemetry: trace,
        });

        res.status(200).json({
          action,
          embedding_dimension: getEmbeddingDimension(),
          ...result,
        });
        return;
      }

      res.status(400).json({
        detail: "알 수 없는 action입니다. 'embed-one' 또는 'backfill'.",
      });
    } catch (error) {
      console.error("admin-embed error:", error);
      res.status(500).json({ detail: errorMessage(error) });
    } finally {
      await trace.flush(supabaseAdmin);
    }
  },
});

// Gemini 호출이 붙어 있어 기본 10초로는 백필이 잘린다(1건당 수백ms~수초 ×
// 최대 50건). maxDuration은 Vercel Hobby 상한이 60초다 — 그 이상이 필요하면
// limit을 줄여 여러 번 호출한다(위 backfill 정렬 계약이 반복 호출을 전제한다).
export const config = { runtime: "nodejs", maxDuration: 60 };
