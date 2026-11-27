// 프리미엄 책자 관리 API 계약(/api/admin/premium-book 아래 페이지 CRUD 와 책자 일괄 적용).
// 서버(api/_routes/admin/premium-book.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/premium-book/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";

const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

/** 한 번에 적용하는 페이지 이미지 상한. */
export const PREMIUM_BOOK_MAX_PAGES = 100;

/** 이 경로들의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const PREMIUM_BOOK_ERROR = {
  /** 기존 행의 sort_order 가 겹쳐 어느 행에 실을지 정할 수 없다. */
  DUPLICATE_SORT_ORDER: "DUPLICATE_SORT_ORDER",
} as const;

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** 경로 :id(bigint identity). 양의 정수가 아니면 400. */
export const pageIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

/** 등록(POST)과 수정(PATCH) 본문. 화면 폼이 만드는 두 컬럼만 받는다. 모르는 키는 400. 이미지는 임시 읽기 URL 이어도 된다. */
export const pageBody = z
  .object({
    sort_order: z.number().int().min(INT4_MIN).max(INT4_MAX),
    image_url: z.string().max(2048),
  })
  .strict();

/** POST /apply 본문. POST /api/admin/uploads 가 돌려준 임시 객체 이름(pdf 는 booklet_pdf, pages 는 page_webp 필드). */
export const applyBody = z
  .object({
    pdf: z.string(),
    pages: z.array(z.string()).min(1).max(PREMIUM_BOOK_MAX_PAGES),
  })
  .strict();

export type PageInput = z.input<typeof pageBody>;
export type PageBody = z.output<typeof pageBody>;
export type ApplyInput = z.input<typeof applyBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

// 쓰는 컬럼만 명시하고 나머지는 통과시킨다. premium_book_pages.id 는 identity 정수다.
export const pageSchema = z.looseObject({
  id: z.number(),
  sort_order: z.number(),
  image_url: z.string(),
});

/** 목록과 적용 결과. sort_order 오름차순. */
export const pageListSchema = z.object({ items: z.array(pageSchema) });

export type PremiumBookPage = z.output<typeof pageSchema>;
export type PremiumBookPageList = z.output<typeof pageListSchema>;
