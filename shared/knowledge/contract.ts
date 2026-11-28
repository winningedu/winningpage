// 수행평가 지식 DB 관리 API 계약(엑셀 일괄 반영 knowledge-bulk, 중복 검사 knowledge-dedupe, 검색 테스트 knowledge-search).
// 서버(api/_routes/admin/knowledge-*.ts)가 응답을 이 스키마의 타입에 맞추고, 브라우저(지식 DB 화면)가 응답 스키마로 검증한다.
// 요청 본문의 값 규칙과 한국어 사유는 request.ts 의 요청 스키마가 맡는다(오류 바디의 errors 문구가 그 사유다).

import { z } from "zod";

/** 일괄 등록 대상 knowledge_type. admin-embed 의 RAG_KNOWLEDGE_TYPES 와 같은 2종이다. */
export const BULK_KNOWLEDGE_TYPES = [
  "topic_pattern",
  "verified_resource",
] as const;

export type BulkKnowledgeType = (typeof BULK_KNOWLEDGE_TYPES)[number];

export const bulkKnowledgeTypeSchema = z.enum(BULK_KNOWLEDGE_TYPES);

// ---------------------------------------------------------------------------
// 한도와 필드 목록(서버 검증과 브라우저 분할 전송이 같은 값을 쓴다)
// ---------------------------------------------------------------------------

/** 요청 한 번에 반영하는 신규와 수정 합계 상한. 클라이언트가 이 크기로 나눠 보낸다. */
export const MAX_BULK_ROWS = 500;

/** 엑셀에서 받아들이는 컬럼. 테이블 컬럼이지만 이 밖인 키(임베딩 등)는 조용히 버리고, 컬럼이 아닌 키는 400 이다. */
export const BULK_WRITABLE_FIELDS = [
  "is_active",
  "grade",
  "subject",
  "career_field",
  "title",
  "content",
  "source",
  "source_link",
  "keywords",
  "memo",
] as const;

/** DB 에서 not null 인 본문 컬럼. 신규는 전부 있어야 하고, 수정은 보낸 값이 비면 안 된다. */
export const BULK_REQUIRED_FIELDS = [
  "grade",
  "subject",
  "title",
  "content",
] as const;

/** 근사 비교가 행마다 임베딩을 1회 호출하므로 요청 한 번의 상한을 둔다. */
export const MAX_DEDUPE_ITEMS = 200;

/** 검색 텍스트 공식(buildKnowledgeSearchText)이 읽는 본문 필드. */
export const KNOWLEDGE_TEXT_FIELDS = [
  "grade",
  "subject",
  "career_field",
  "title",
  "content",
  "source",
  "source_link",
  "keywords",
  "memo",
] as const;

export type KnowledgeTextField = (typeof KNOWLEDGE_TEXT_FIELDS)[number];

/** 검색 테스트가 한 번에 돌려주는 행 수 기본값. */
export const SEARCH_PREVIEW_DEFAULT_LIMIT = 20;

/** 검색 테스트 행 수 상한. */
export const SEARCH_PREVIEW_MAX_LIMIT = 50;

/** 검색 방식. hybrid 는 학생 요청 경로의 1차 경로이고 vector 는 폴백 비교용이다. */
export const SEARCH_PREVIEW_MODES = ["vector", "hybrid"] as const;

export type SearchPreviewMode = (typeof SEARCH_PREVIEW_MODES)[number];

// ---------------------------------------------------------------------------
// 요청 행(요청 스키마와 브라우저 입력 타입은 request.ts)
// ---------------------------------------------------------------------------

export type DedupeItem = { rowNo: number; id?: string } & Record<
  KnowledgeTextField,
  string
>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

export const nearMatchSchema = z.object({
  id: z.string(),
  title: z.string(),
  similarity: z.number(),
});

export type NearMatch = z.output<typeof nearMatchSchema>;

export const dedupeResultSchema = z.object({
  rowNo: z.number(),
  exact: z.array(z.object({ id: z.string(), title: z.string() })),
  near: z.array(nearMatchSchema),
});

export type DedupeResult = z.output<typeof dedupeResultSchema>;

/** 200 응답. */
export const knowledgeDedupeResultSchema = z.object({
  items: z.array(dedupeResultSchema),
});

export type KnowledgeDedupeResult = z.output<
  typeof knowledgeDedupeResultSchema
>;

/** 200 응답. ids 는 신규 id 뒤에 수정 id 순서다. */
export const knowledgeBulkResultSchema = z.object({
  inserted: z.number(),
  updated: z.number(),
  ids: z.array(z.string()),
});

export type KnowledgeBulkResult = z.output<typeof knowledgeBulkResultSchema>;

export const searchPreviewItemSchema = z.object({
  rank: z.number(),
  id: z.string(),
  title: z.string(),
  grade: z.string(),
  subject: z.string(),
  career_field: z.string(),
  similarity: z.number(),
  passesThreshold: z.boolean(),
  wouldBeInjected: z.boolean(),
  /** hybrid 만. 의미 순위, 의미 쪽 threshold 아래라 순위가 없으면 null. */
  semanticRank: z.number().nullish(),
  /** hybrid 만. 단어 순위, 단어가 걸리지 않았으면 null. */
  keywordRank: z.number().nullish(),
  /** hybrid 만. RRF 합산 점수(결과 순서의 기준). */
  rrfScore: z.number().nullish(),
});

export type SearchPreviewItem = z.output<typeof searchPreviewItemSchema>;

/** 200 응답. */
export const searchPreviewResultSchema = z.object({
  mode: z.enum(SEARCH_PREVIEW_MODES),
  threshold: z.number(),
  queryText: z.string(),
  /** hybrid 일 때 RPC 에 넘긴 단어 질의. vector 면 null. */
  keywordQuery: z.string().nullable(),
  items: z.array(searchPreviewItemSchema),
});

export type SearchPreviewResult = z.output<typeof searchPreviewResultSchema>;
