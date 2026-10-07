// 관리자 지식 DB 검색 테스트의 판단 순수 함수. 핸들러는
// api/performance/admin-knowledge-search.ts 이고, 질의문 조립과 패킹 규칙은
// 학생 요청 경로(knowledge.ts)의 함수를 그대로 가져다 쓴다.

import {
  buildKnowledgeKeywordQueryFor,
  getBaseGradeForRpc,
  type KnowledgeRow,
  knowledgeMatchThreshold,
  knowledgeVectorLabel,
  packRows,
  RESOURCE_MAX_CHARS,
  RESOURCE_MAX_ITEMS,
  resolveFilterSubject,
  TOPIC_MAX_CHARS,
  TOPIC_MAX_ITEMS,
} from "./knowledge.js";
import {
  type BulkKnowledgeType,
  isBulkKnowledgeType,
} from "./knowledgeDedupe.js";

/** 검색 테스트가 한 번에 돌려주는 행 수 기본값. */
export const SEARCH_PREVIEW_DEFAULT_LIMIT = 20;

/** 검색 테스트 행 수 상한. */
export const SEARCH_PREVIEW_MAX_LIMIT = 50;

/** 검색 방식. hybrid 는 학생 요청 경로의 1차 경로이고 vector 는 폴백 비교용이다. */
export type SearchPreviewMode = "vector" | "hybrid";

export type SearchPreviewBody = {
  knowledgeType: BulkKnowledgeType;
  grade: string;
  subject: string;
  career: string;
  selectedTopic: string;
  assessmentInfo: string;
  includeOtherSubjects: boolean;
  limit: number;
  mode: SearchPreviewMode;
};

const TEXT_KEYS = [
  "grade",
  "subject",
  "career",
  "selectedTopic",
  "assessmentInfo",
] as const;

export function validateSearchPreviewBody(
  raw: unknown,
): { ok: true; body: SearchPreviewBody } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "요청 바디가 올바르지 않습니다." };
  }
  const source = raw as Record<string, unknown>;
  if (!isBulkKnowledgeType(source.knowledgeType)) {
    return { ok: false, reason: "knowledgeType 이 올바르지 않습니다." };
  }
  const knowledgeType = source.knowledgeType;

  const texts = {} as Record<(typeof TEXT_KEYS)[number], string>;
  for (const key of TEXT_KEYS) {
    const value = source[key];
    if (value !== undefined && value !== null && typeof value !== "string") {
      return { ok: false, reason: `${key} 는 문자열이어야 합니다.` };
    }
    texts[key] = typeof value === "string" ? value : "";
  }

  const rawLimit = source.limit ?? SEARCH_PREVIEW_DEFAULT_LIMIT;
  if (
    !Number.isInteger(rawLimit) ||
    (rawLimit as number) < 1 ||
    (rawLimit as number) > SEARCH_PREVIEW_MAX_LIMIT
  ) {
    return {
      ok: false,
      reason: `limit 는 1부터 ${SEARCH_PREVIEW_MAX_LIMIT} 사이 정수여야 합니다.`,
    };
  }

  if (
    source.includeOtherSubjects !== undefined &&
    typeof source.includeOtherSubjects !== "boolean"
  ) {
    return { ok: false, reason: "includeOtherSubjects 는 참 거짓 값입니다." };
  }
  // 기본값은 학생 요청 경로와 같다. 주제 추천은 다른 과목을 포함하고 자료 검색은 뺀다.
  const includeOtherSubjects =
    source.includeOtherSubjects ?? knowledgeType === "topic_pattern";

  const mode = source.mode ?? "hybrid";
  if (mode !== "vector" && mode !== "hybrid") {
    return { ok: false, reason: "mode 는 vector 또는 hybrid 입니다." };
  }

  return {
    ok: true,
    body: {
      knowledgeType,
      ...texts,
      includeOtherSubjects,
      limit: rawLimit as number,
      mode,
    },
  };
}

export type SearchPreviewItem = {
  rank: number;
  id: string;
  title: string;
  grade: string;
  subject: string;
  career_field: string;
  similarity: number;
  passesThreshold: boolean;
  wouldBeInjected: boolean;
  /** hybrid 만. 의미 순위, 의미 쪽 threshold 아래라 순위가 없으면 null. */
  semanticRank?: number | null;
  /** hybrid 만. 단어 순위, 단어가 걸리지 않았으면 null. */
  keywordRank?: number | null;
  /** hybrid 만. RRF 합산 점수(결과 순서의 기준). */
  rrfScore?: number | null;
};

/** 하이브리드 RPC 행. 벡터 RPC 행에는 세 순위 컬럼이 없다. */
export type SearchPreviewRow = KnowledgeRow & {
  semantic_rank?: number | null;
  keyword_rank?: number | null;
  rrf_score?: number | null;
};

/**
 * RPC 행에 학생 요청 경로의 판정을 붙인다. 주입 여부는 실제 경로와 같은 순서로 정한다.
 * 후보 중 앞 maxItems 건을 골라 packRows 로 글자 상한까지 채우고, 상한을 넘긴 행부터 뒤는
 * 모두 버린다.
 *
 * vector 는 threshold 0 으로 받은 행(유사도 내림차순)이라 후보가 threshold 통과 행이다.
 * hybrid 는 RPC 가 의미 쪽에 실제 threshold 를 이미 걸었으므로 RRF 순서의 모든 행이 후보다.
 * 단어로만 걸린 행은 유사도가 threshold 아래여도 주입된다. 다만 검색 테스트의 상한
 * (limit)이 실제 경로의 match_count 보다 크면 RPC 안 두 순위의 후보 폭이 넓어져, 후보가
 * 아주 많을 때 꼬리 순서가 실제 경로와 조금 다를 수 있다.
 */
export function buildSearchPreviewItems(
  knowledgeType: BulkKnowledgeType,
  rows: SearchPreviewRow[],
  mode: SearchPreviewMode = "vector",
): { threshold: number; items: SearchPreviewItem[] } {
  const threshold = knowledgeMatchThreshold(knowledgeType);
  const isResource = knowledgeType === "verified_resource";
  const maxItems = isResource ? RESOURCE_MAX_ITEMS : TOPIC_MAX_ITEMS;
  const maxChars = isResource ? RESOURCE_MAX_CHARS : TOPIC_MAX_CHARS;

  const candidates =
    mode === "hybrid"
      ? rows
      : rows.filter((row) => (row.similarity ?? 0) >= threshold);
  const injected = new Set<KnowledgeRow>(
    packRows(
      candidates.slice(0, maxItems),
      maxChars,
      knowledgeVectorLabel(knowledgeType),
    ).map((entry) => entry.row),
  );

  return {
    threshold,
    items: rows.map((row, index) => ({
      rank: index + 1,
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      grade: String(row.grade ?? ""),
      subject: String(row.subject ?? ""),
      career_field: String(row.career_field ?? ""),
      similarity: row.similarity ?? 0,
      passesThreshold: (row.similarity ?? 0) >= threshold,
      wouldBeInjected: injected.has(row),
      ...(mode === "hybrid"
        ? {
            semanticRank: row.semantic_rank ?? null,
            keywordRank: row.keyword_rank ?? null,
            rrfScore: row.rrf_score ?? null,
          }
        : {}),
    })),
  };
}

/**
 * 검색 테스트가 부를 RPC 와 인자. 학년과 과목 필터는 학생 요청 경로와 같은 함수로 만든다.
 *
 * vector 는 match_winning_suhaeng_all_subjects 를 threshold 0 으로 불러 기준 아래 행도 받는다.
 * 통과 판정은 buildSearchPreviewItems 가 실제 경로 threshold 로 다시 한다.
 *
 * hybrid 는 match_winning_suhaeng_hybrid 를 실제 경로 threshold 로 부른다. threshold 를 낮추면
 * 의미 순위에 기준 아래 행이 끼어 RRF 합산 순서가 실제 경로와 달라지기 때문이다.
 */
export function buildSearchPreviewRpc(
  body: SearchPreviewBody,
  queryEmbedding: number[],
) {
  const filters = {
    query_embedding: queryEmbedding,
    filter_knowledge_type: body.knowledgeType,
    filter_grade: getBaseGradeForRpc(body.grade),
    filter_subject: resolveFilterSubject({
      includeOtherSubjects: body.includeOtherSubjects,
      subject: body.subject,
    }),
    match_count: body.limit,
  };

  if (body.mode === "vector") {
    return {
      fn: "match_winning_suhaeng_all_subjects" as const,
      args: { ...filters, match_threshold: 0 },
    };
  }

  return {
    fn: "match_winning_suhaeng_hybrid" as const,
    args: {
      ...filters,
      query_keywords: buildKnowledgeKeywordQueryFor(body),
      match_threshold: knowledgeMatchThreshold(body.knowledgeType),
    },
  };
}
