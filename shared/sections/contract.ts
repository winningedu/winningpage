// 섹션 엔진 API 계약. 서버(api/_routes/admin/sections.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/engine/api.ts)는 응답 스키마로 검증한다.
// 행 모양은 섹션마다 달라(레지스트리 api/_lib/admin-sections/registry.ts) 행은 느슨하게 받고, 컬럼 규칙은 서버가 정한다.

import { z } from "zod";

/** 목록과 내보내기 검색어 길이 한도. 비싼 쿼리를 못 보내게 막는다. */
export const SECTION_SEARCH_MAX_LENGTH = 100;
/** 내보내기 시작 위치 한도(입결 43,170행의 수십 배). */
export const SECTION_EXPORT_FROM_MAX = 1_000_000;

/** 섹션 쓰기 라우트의 도메인 problem code(DB 제약 위반을 바꾼 것). 공통 코드는 shared/http/codes.ts 다. */
export const SECTION_ERROR = {
  DB_UNIQUE_VIOLATION: "DB_UNIQUE_VIOLATION",
  DB_NOT_NULL_VIOLATION: "DB_NOT_NULL_VIOLATION",
  DB_CHECK_VIOLATION: "DB_CHECK_VIOLATION",
} as const;

export type SectionErrorCode =
  (typeof SECTION_ERROR)[keyof typeof SECTION_ERROR];

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** GET /api/admin/sections/:key. page 는 서버 페이지 섹션에서만 쓴다. */
export const sectionListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().max(SECTION_SEARCH_MAX_LENGTH).optional(),
});

/** GET /api/admin/sections/:key/export. from 부터 한 덩어리를 읽는다. */
export const sectionExportQuery = z.object({
  from: z.coerce.number().int().min(0).max(SECTION_EXPORT_FROM_MAX).default(0),
  q: z.string().max(SECTION_SEARCH_MAX_LENGTH).optional(),
});

/** 등록(POST)과 수정(PATCH, meta) 본문. 값의 키 규칙은 서버가 섹션 레지스트리로 판정한다. */
export const sectionValuesBody = z.object({
  values: z.record(z.string(), z.unknown(), {
    error: "values 객체가 필요합니다.",
  }),
});

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

/** 섹션 행 하나. 컬럼은 섹션마다 다르다. */
export const sectionRowSchema = z.record(z.string(), z.any());

export const sectionListSchema = z.object({
  items: z.array(sectionRowSchema),
  total: z.number(),
});

/** next 는 다음 from, 마지막 덩어리면 null. */
export const sectionExportSchema = z.object({
  items: z.array(sectionRowSchema),
  next: z.number().nullable(),
});

export type SectionListQuery = z.input<typeof sectionListQuery>;
export type SectionValuesBody = z.input<typeof sectionValuesBody>;
export type SectionRow = z.output<typeof sectionRowSchema>;
export type SectionList = z.output<typeof sectionListSchema>;
export type SectionExport = z.output<typeof sectionExportSchema>;
