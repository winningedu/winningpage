// 입시 관리 API 계약(/api/admin/admission 아래 공개 연도, 입결정보, 대입모집요강 일괄 반영).
// 서버(api/_routes/admin/admission.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/admission/AdmissionPanels.tsx)는 응답 스키마로 검증한다.
// 일괄 반영의 행 규칙(컬럼, 허용 값, 한국어 사유)은 서버 api/_lib/admission/ 가 맡는다.

import { z } from "zod";
import { guidelineRowSchema } from "./guidelineRow.js";
import { resultRowSchema } from "./resultRow.js";

/** 공개 연도 범위. */
export const ADMISSION_YEAR_MIN = 2000;
export const ADMISSION_YEAR_MAX = 2100;
/** 입결정보 일괄 반영 한 번에 보내는 행 상한(브라우저 청크 크기와 같다). */
export const RESULTS_BULK_MAX_ITEMS = 500;
/** 입결정보 한 쪽 행 수(PostgREST 한 번에 돌려주는 상한). */
export const RESULTS_PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** PUT /active-year. */
export const activeYearBody = z.object({
  year: z.int().min(ADMISSION_YEAR_MIN).max(ADMISSION_YEAR_MAX),
});

/** GET /results/rows?offset=N&fields=all|id. 엑셀 내려받기는 all, 업로드 미리보기는 id. */
export const resultsRowsQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  fields: z.enum(["all", "id"]),
});

/**
 * 행마다 규칙을 보고 첫 위반만 "n번째 행: 사유" 로 낸다(errors[0].message). 모든 행의 이슈를 싣지 않는다.
 * 행 값은 규칙을 통과한 입력 그대로다.
 */
function firstBadRow(rowSchema: z.ZodType) {
  return (items: unknown[], ctx: z.RefinementCtx) => {
    for (const [index, item] of items.entries()) {
      const parsed = rowSchema.safeParse(item);
      if (parsed.success) continue;
      ctx.addIssue({
        code: "custom",
        path: [index],
        message: `${index + 1}번째 행: ${parsed.error.issues[0]?.message}`,
      });
      return;
    }
  };
}

/** 일괄 반영 한 행. 칸 규칙은 서버 응답과 같은 shared/admission/*Row.ts 가 보고 통과한 입력이 그대로 온다. */
type BulkRow = Record<string, unknown>;

const resultsItemsMessage = {
  error: `items 는 ${RESULTS_BULK_MAX_ITEMS}행 이하 배열이어야 합니다.`,
};

/** POST /results/bulk. 행 하나하나는 resultRowSchema 로 본다. */
export const resultsBulkBody = z.object(
  {
    items: z
      .array(z.custom<BulkRow>(), resultsItemsMessage)
      .max(RESULTS_BULK_MAX_ITEMS, { ...resultsItemsMessage, abort: true })
      .superRefine(firstBadRow(resultRowSchema)),
  },
  resultsItemsMessage,
);

const guidelinesItemsMessage = { error: "items 는 행 배열이어야 합니다." };

/** PUT /guidelines/bulk. 브라우저가 3 MB 단위로 나눠 보낸다(Vercel 본문 4.5 MB 한도). */
export const guidelinesBulkBody = z.object(
  {
    items: z
      .array(z.custom<BulkRow>(), guidelinesItemsMessage)
      .superRefine(firstBadRow(guidelineRowSchema)),
  },
  guidelinesItemsMessage,
);

export type ActiveYearInput = z.input<typeof activeYearBody>;
export type ResultsRowsQueryInput = z.input<typeof resultsRowsQuery>;
export type ResultsBulkInput = z.input<typeof resultsBulkBody>;
export type GuidelinesBulkInput = z.input<typeof guidelinesBulkBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

export const activeYearSchema = z.object({ year: z.number() });
export const resultsCountSchema = z.object({ total: z.number() });
/** 행 컬럼은 fields 에 따라 다르다. */
export const resultsRowsSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
});
export const resultsBulkSchema = z.object({
  inserted: z.number(),
  updated: z.number(),
});
export const guidelinesBulkSchema = z.object({ upserted: z.number() });

export type ActiveYear = z.output<typeof activeYearSchema>;
export type ResultsCount = z.output<typeof resultsCountSchema>;
export type ResultsRows = z.output<typeof resultsRowsSchema>;
export type ResultsBulk = z.output<typeof resultsBulkSchema>;
export type GuidelinesBulk = z.output<typeof guidelinesBulkSchema>;
