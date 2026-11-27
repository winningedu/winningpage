// 지식 항목 제목 API 계약(GET /api/admin/knowledge-items/titles). 서버(api/_routes/admin/knowledge-items.ts)는 쿼리 스키마로 검증하고,
// 브라우저(src/pages/admin/knowledge/evals/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";
import { knowledgeTypeSchema } from "../knowledge-eval/contract.js";

/** 한 번에 읽는 id 수 상한. 브라우저는 이 수씩 나눠 부른다. */
export const TITLES_IDS_MAX = 200;
/** 제목 검색 결과 수 상한(옛 화면과 같다). */
export const TITLES_SEARCH_LIMIT = 20;

const idList = z
  .string()
  .transform((text) => [...new Set(text.split(",").map((part) => part.trim()))])
  .pipe(z.array(z.uuid()).min(1).max(TITLES_IDS_MAX));

/**
 * 두 방식 중 하나만 쓴다(ids 는 knowledgeType, q 와 함께 못 쓴다).
 *   ?ids=<uuid,uuid,...>  id 로 제목 조회. 지식 유형은 거르지 않는다.
 *   ?knowledgeType=&q=    그 유형에서 제목 검색. q 가 비면 빈 items.
 */
export const titlesQuery = z.union([
  z.strictObject({ ids: idList }),
  z.strictObject({
    knowledgeType: knowledgeTypeSchema,
    q: z
      .string()
      .optional()
      .transform((text) => (text ?? "").trim()),
  }),
]);
export type TitlesQueryInput = z.input<typeof titlesQuery>;

/** 200 { items }. title 이 비면 "". */
export const titlesResponse = z.object({
  items: z.array(z.object({ id: z.string(), title: z.string() })),
});
export type TitlesResponse = z.output<typeof titlesResponse>;
