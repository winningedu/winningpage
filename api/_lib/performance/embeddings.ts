// 수행평가 RAG — 문서측 임베딩 생성 모듈 (Gemini embedContent).
//
// 외부 앱(`/Users/hyunsoo/uwellnow/suhaengpyeong`)의 `api/_lib/embeddings.js`를
// 이 저장소로 네이티브 이식한 것이다. 이식 전에는 `api/request-winning-embedding.js`가
// 외부 도메인 `RAG_API_BASE_URL/api/admin-embeddings`로 프록시해 임베딩을
// 외부 앱에 위임했는데, 그 앱이 폐기 대상이라 여기서 자립 수행한다.
// (근거: docs/수행평가-상세-명세.md §8.7 「제안(임베딩 경로 정리)」, §12.3)
//
// ─────────────────────────────────────────────────────────────────────
// ⚠️ 기존 코퍼스와의 호환성 — 모델·차원을 바꾸면 조용히 망가진다
// ─────────────────────────────────────────────────────────────────────
// `winning_assessment_knowledge_items.embedding`은 `vector(768)`이고
// (sql/00_base_schema.sql:969), 이미 저장된 행들은 전부 `gemini-embedding-2`의
// 768차원 출력이다. 아래 두 기본값(`gemini-embedding-2` / `768`)은 그 코퍼스와
// **반드시 일치해야 한다.**
//
//   · 차원이 다르면 → insert 시점에 타입 에러로 즉시 터진다(발견은 쉽다).
//   · **모델만 다르면 → 아무 에러도 나지 않는다.** 같은 768차원이라도 모델이
//     다르면 벡터 공간이 달라서, 신규 행과 기존 행 사이의 코사인 유사도가
//     의미 없는 숫자가 된다. RPC `match_winning_suhaeng_all_subjects`는
//     `match_threshold`(0.48~0.52) 위만 통과시키므로 결과가 조용히 비거나
//     엉뚱한 행이 올라오고, 그때는 키워드 폴백으로 떨어져 "품질이 좀
//     떨어졌네" 정도로만 보인다. 원인 추적이 대단히 어렵다.
//
// 그래서 `GEMINI_EMBEDDING_MODEL` / `GEMINI_EMBEDDING_DIMENSION`을 바꾸는 것은
// **코퍼스 전량 재임베딩(`POST /api/performance/admin-embed` action=backfill,
// force=true)을 동반하는 마이그레이션**이지, 환경변수 토글이 아니다.
// 차원 변경은 여기에 더해 컬럼 타입(`vector(768)`)과 HNSW 인덱스
// (`winning_suhaeng_embedding_hnsw_idx`) 재생성까지 따라온다.

import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from "@ai-sdk/google";
import { embed } from "ai";
import type { AiTrace } from "../ai/telemetry/trace.js";

/** 코퍼스에 이미 저장된 벡터를 만든 모델. 위 경고 참고. */
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2";

/** `vector(768)` 컬럼 타입과 일치해야 하는 출력 차원. 위 경고 참고. */
export const DEFAULT_EMBEDDING_DIMENSION = 768;

let googleProvider: GoogleGenerativeAIProvider | null = null;

/** 키를 호출 시점에 읽고 AI SDK Google 공급자를 처음 쓸 때 만든다. 키가 없으면 그 호출만 실패한다. */
function getGoogleProvider(): GoogleGenerativeAIProvider {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  if (!googleProvider) {
    googleProvider = createGoogleGenerativeAI({ apiKey });
  }

  return googleProvider;
}

/** 지금 임베딩에 쓰는 모델 이름. 갱신 행의 `embedding_model` 컬럼에 그대로 기록한다. */
export function getEmbeddingModel(): string {
  return (
    String(process.env.GEMINI_EMBEDDING_MODEL || "").trim() ||
    DEFAULT_EMBEDDING_MODEL
  );
}

/** 지금 임베딩에 쓰는 출력 차원. */
export function getEmbeddingDimension(): number {
  const raw = Number(
    process.env.GEMINI_EMBEDDING_DIMENSION || DEFAULT_EMBEDDING_DIMENSION,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_EMBEDDING_DIMENSION;
}

/**
 * 지식 항목 1건 → 임베딩 대상 텍스트.
 *
 * 이 문자열은 두 곳에 동시에 쓰인다:
 *   1. Gemini 입력 (= 벡터 자체를 결정한다)
 *   2. `search_text` 컬럼 (= 재임베딩 방지 캐시의 비교 기준)
 *
 * ⚠️ 줄 구성·순서·라벨을 바꾸면 **기존 임베딩과 신규 임베딩의 분포가 어긋난다.**
 *    같은 항목이라도 텍스트가 달라지면 벡터가 달라지고, 한 테이블 안에 서로 다른
 *    공식으로 만든 벡터가 섞이면 유사도 비교의 기준선이 흔들린다. 또 `search_text`
 *    정확 일치 캐시가 전부 미스가 되어 저장할 때마다 Gemini를 재호출한다.
 *    빌더를 바꾸면 반드시 force 백필로 코퍼스 전량을 다시 태워야 한다.
 *
 * 정본은 외부 앱의 **라이브** 빌더 `api/admin-embeddings.js:215-228`(10줄)이다.
 * 명세서 §12.3이 그 버전을 정본으로 못박고(목적지에 `keywords` 컬럼이 실재한다
 * — sql/00_base_schema.sql:974, `text default ''`), §8의 BLOCK(`:1855`)도 나머지
 * 2벌(`api/_lib/embeddings.js:18-30`, `api/_lib/winning-embedding.js:69-81`)을
 * 데드로 판정해 삭제 대상으로 둔다. 이식 전 어드민(`src/pages/Admin.jsx`)이
 * 호출하던 것도 `/api/admin-embeddings` 라이브 쪽이므로, **현재 DB에 저장된
 * 모든 행의 `search_text`가 이 10줄 공식**이다. 데드 빌더(9줄, `키워드:` 없음)를
 * 따르면 `admin-embed.js` embedOne()의 정확 일치 캐시가 기존 행 전량에서 미스가
 * 나 저장할 때마다 Gemini 비용이 다시 나가고, 한 테이블에 서로 다른 공식의
 * 벡터가 섞인다.
 *
 * 외부 라이브 빌더 대비 변경점은 **출처 링크 한 줄뿐**이다.
 *   외부: `getSourceLink(item)` — `source_link`/`source_url`/`url`/`link` 등
 *         10키 탐색 + `meta`/`metadata`/`extra` JSON 파싱 후 `row.source` 정규식
 *   여기: `item.source_link` 단일 참조
 * 그 다중 폴백은 목적지 테이블에 링크 컬럼이 하나도 없어서 생긴 우회였고
 * (실효 경로가 정규식 1줄뿐이었다 — 명세서 §8.7 WARN), `sql/53_performance.sql`이
 * `source_link text` 컬럼을 신설·백필하면서 근거가 사라졌다. 나머지 9줄은 원문 그대로다.
 *
 * ⚠️ `출처 링크` 줄은 이 변경 때문에 기존 코퍼스와 값이 달라진다 — 외부에서는
 *    컬럼이 없어 항상 빈 문자열이었고, 여기서는 백필된 URL이 들어간다. 즉
 *    **의도된 divergence 1건이 남아 있으므로 배포 시 force 백필이 필수**다:
 *      POST /api/performance/admin-embed { action:'backfill', force:true }
 *    를 `embedded`가 0이 될 때까지 반복 (sql/README.md 53번 행의 배포 런북 참고).
 *
 * ⚠️ `keywords`는 이 저장소의 어떤 쓰기 경로에도 없다(어드민 폼에 필드 없음).
 *    그래도 줄을 유지하는 이유는 기존 코퍼스의 공식과 문자 단위로 일치시키기
 *    위해서다. 호출부는 이 컬럼을 반드시 select 해야 한다 —
 *    `api/performance/admin-embed.js`의 SELECT_COLUMNS 에 포함되어 있다.
 *    빠뜨리면 값이 있는 행에서도 `키워드: `가 빈 채로 조립돼 공식이 다시 어긋난다.
 */
/** `buildKnowledgeSearchText`가 실제로 읽는 필드만 담은 최소 형태. */
type KnowledgeSearchTextItem = {
  knowledge_type?: string;
  grade?: string;
  subject?: string;
  career_field?: string;
  title?: string;
  content?: string;
  source?: string;
  source_link?: string;
  keywords?: string;
  memo?: string;
};

export function buildKnowledgeSearchText(item: KnowledgeSearchTextItem = {}) {
  return [
    `DB유형: ${item.knowledge_type || ""}`,
    `학년: ${item.grade || ""}`,
    `교과군: ${item.subject || ""}`,
    `진로분야: ${item.career_field || ""}`,
    `제목: ${item.title || ""}`,
    `핵심 내용: ${item.content || ""}`,
    `출처: ${item.source || ""}`,
    `출처 링크: ${item.source_link || ""}`,
    `키워드: ${item.keywords || ""}`,
    `메모: ${item.memo || ""}`,
  ].join("\n");
}

/**
 * 텍스트 1건 → 임베딩 벡터(number[]).
 *
 * 빈 입력과 빈 응답을 모두 throw로 막는다(원본과 동일). 빈 벡터를 그대로
 * 저장하면 그 행은 영원히 검색에 잡히지 않으면서 `embedding_status='done'`으로
 * 보이기 때문에, 실패는 조용히 넘기지 않고 반드시 터뜨린다.
 */
export async function embedText(
  text: string,
  telemetry?: AiTrace,
): Promise<number[]> {
  const value = String(text || "").trim();

  if (!value) {
    throw new Error("임베딩할 텍스트가 비어 있습니다.");
  }

  const google = getGoogleProvider();
  const model = getEmbeddingModel();
  const outputDimensionality = getEmbeddingDimension();
  const startedAt = Date.now();

  // 기록 중 예외가 호출 흐름에 영향을 주지 않도록 삼킨다. 토큰 수는 응답에 없어 null 이다.
  const record = (status: "ok" | "error", error?: unknown, code?: string) => {
    if (!telemetry) return;
    try {
      const err = error as {
        status?: unknown;
        code?: unknown;
        statusCode?: unknown;
        message?: string;
      };
      telemetry.recordCall({
        kind: "embed",
        model,
        startedAt,
        latencyMs: Date.now() - startedAt,
        transportAttempt: 1,
        status,
        errorCode:
          status === "ok"
            ? null
            : (code ??
              String(err?.status ?? err?.code ?? err?.statusCode ?? "unknown")),
        errorMessage:
          status === "ok" ? null : String(err?.message ?? error ?? ""),
        inputChars: value.length,
      });
    } catch (recordError) {
      console.warn("[ai-telemetry] 기록 실패:", recordError);
    }
  };

  // 재시도는 호출부(백필 배치 등)의 몫이라 AI SDK 자체 재시도를 끈다. 입력 지시문(task)은
  // 넣지 않는다. 넣으면 기존 코퍼스와 벡터 공간이 어긋나 전량 재임베딩이 필요하다.
  let embedding: number[] | undefined;
  try {
    const result = await embed({
      model: google.embeddingModel(model),
      value,
      maxRetries: 0,
      providerOptions: { google: { outputDimensionality } },
    });
    embedding = result.embedding;
  } catch (error) {
    record("error", error);
    throw error;
  }

  if (!Array.isArray(embedding) || embedding.length === 0) {
    const emptyError = new Error(
      "Gemini embedding 생성 실패: embedding 값이 비어 있습니다.",
    );
    record("error", emptyError, "empty_embedding");
    throw emptyError;
  }

  // 길이가 컬럼 차원과 다르면 저장 시점이 아니라 여기서 바로 막는다.
  if (embedding.length !== outputDimensionality) {
    const dimensionError = new Error(
      `Gemini embedding 차원 불일치: ${outputDimensionality}차원을 기대했지만 ${embedding.length}차원이 왔습니다.`,
    );
    record("error", dimensionError, "dimension_mismatch");
    throw dimensionError;
  }

  record("ok");
  return embedding;
}
