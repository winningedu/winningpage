// 관리자 지식 DB 검색 테스트의 판단 순수 함수. 핸들러는
// api/performance/admin-knowledge-search.ts 이고, 질의문 조립과 패킹 규칙은
// 학생 요청 경로(knowledge.ts)의 함수를 그대로 가져다 쓴다.

import {
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

export type SearchPreviewBody = {
  knowledgeType: BulkKnowledgeType;
  grade: string;
  subject: string;
  career: string;
  selectedTopic: string;
  assessmentInfo: string;
  includeOtherSubjects: boolean;
  limit: number;
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

  return {
    ok: true,
    body: {
      knowledgeType,
      ...texts,
      includeOtherSubjects,
      limit: rawLimit as number,
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
};

/**
 * threshold 0 으로 받은 RPC 행(유사도 내림차순)에 학생 요청 경로의 판정을 붙인다.
 * 주입 여부는 실제 경로와 같은 순서로 정한다. threshold 통과 행 중 앞 maxItems 건을
 * 골라 packRows 로 글자 상한까지 채우고, 상한을 넘긴 행부터 뒤는 모두 버린다.
 */
export function buildSearchPreviewItems(
  knowledgeType: BulkKnowledgeType,
  rows: KnowledgeRow[],
): { threshold: number; items: SearchPreviewItem[] } {
  const threshold = knowledgeMatchThreshold(knowledgeType);
  const isResource = knowledgeType === "verified_resource";
  const maxItems = isResource ? RESOURCE_MAX_ITEMS : TOPIC_MAX_ITEMS;
  const maxChars = isResource ? RESOURCE_MAX_CHARS : TOPIC_MAX_CHARS;

  const passing = rows.filter((row) => (row.similarity ?? 0) >= threshold);
  const injected = new Set(
    packRows(
      passing.slice(0, maxItems),
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
    })),
  };
}

/**
 * RPC match_winning_suhaeng_all_subjects 인자. 학년과 과목 필터는 학생 요청 경로와 같은
 * 함수로 만들고, threshold 는 0 으로 낮춰 기준 아래 행도 받는다. 통과 판정은
 * buildSearchPreviewItems 가 실제 경로 threshold 로 다시 한다.
 */
export function buildSearchPreviewRpcArgs(
  body: SearchPreviewBody,
  queryEmbedding: number[],
) {
  return {
    query_embedding: queryEmbedding,
    filter_knowledge_type: body.knowledgeType,
    filter_grade: getBaseGradeForRpc(body.grade),
    filter_subject: resolveFilterSubject({
      includeOtherSubjects: body.includeOtherSubjects,
      subject: body.subject,
    }),
    match_count: body.limit,
    match_threshold: 0,
  };
}
