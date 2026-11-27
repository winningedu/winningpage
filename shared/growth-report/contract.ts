// 성장설계 회차 운영 조회 API 계약(GET /api/admin/growth-reports, /:id). 서버(api/_routes/admin/growth-reports.ts)는
// 요청 스키마로 검증하고, 브라우저(src/pages/admin/growth/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";
import { uuidId } from "../http/params.js";

/** 목록 쿼리 값의 규칙(허용 상태, 페이지 범위)과 한국어 사유를 서버 parseListQuery 가 맡을 때 쓰는 코드. */
export const GROWTH_REPORT_ERROR = { INVALID_QUERY: "INVALID_QUERY" } as const;

const queryValue = z.union([z.string(), z.array(z.string())]).optional();

/** GET ?status=&q=&page=&pageSize=. 여기서는 모양만 거른다. */
export const reportListQuery = z.object({
  status: queryValue,
  q: queryValue,
  page: queryValue,
  pageSize: queryValue,
});

/** GET /:id 경로. */
export const reportIdParams = z.object({ id: uuidId });

/** 회차 한 건. 목록 항목과 상세가 같은 모양이다. */
export const growthReport = z.object({
  id: z.string(),
  profileId: z.string(),
  studentName: z.string().nullable(),
  email: z.string().nullable(),
  status: z.string(),
  currentStep: z.number(),
  track: z.string().nullable(),
  issuedAt: z.string().nullable(),
  // growth_reports.last_activity_at 은 not null 이다.
  lastActivityAt: z.string(),
  ledgerId: z.string().nullable(),
  ledgerReversedAt: z.string().nullable(),
  terminal: z
    .object({ reason: z.string(), at: z.string(), step: z.number() })
    .nullable(),
  progress: z.array(
    z.object({
      step: z.number(),
      label: z.string(),
      status: z.string(),
      attempts: z.number(),
    }),
  ),
});
export type GrowthReport = z.output<typeof growthReport>;

export const growthReportsPage = z.object({
  items: z.array(growthReport),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type GrowthReportsPage = z.output<typeof growthReportsPage>;
