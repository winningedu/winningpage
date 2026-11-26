// 방문 분석 API 계약. 서버(api/_routes/admin/web-analytics.ts)가 요청 스키마로 검증하고, 브라우저(src/pages/admin/web-analytics/api.ts)가 응답 스키마로 검증한다.
// 이벤트 이름과 속성의 정본은 수집 쪽 src/lib/analytics.ts 다(서버 report.test.ts 가 서버 목록과 맞춰 잠근다). 그래서 응답에서는 문자열로만 받는다.

import { z } from "zod";

/** 방문 분석 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const WEB_ANALYTICS_ERROR = {
  NOT_CONFIGURED: "NOT_CONFIGURED",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
} as const;

export type WebAnalyticsErrorCode =
  (typeof WEB_ANALYTICS_ERROR)[keyof typeof WEB_ANALYTICS_ERROR];

/** GET 쿼리. from, to 는 보는 사람 시간대의 YYYY-MM-DD 이고 형식과 순서는 서버가 읽어 400 으로 거른다(X-Time-Zone 헤더 필수). */
export const webAnalyticsQuery = z.object({ from: z.string(), to: z.string() });

export type WebAnalyticsQuery = z.input<typeof webAnalyticsQuery>;

const rangeSchema = z.object({ from: z.string(), to: z.string() });

/** 200 응답. ok 필드 없이 보고서 그대로다. */
export const webAnalyticsReportSchema = z.object({
  range: rangeSchema,
  totals: z.object({ pageviews: z.number(), visitors: z.number() }),
  topPages: z.array(
    z.object({
      path: z.string(),
      pageviews: z.number(),
      visitors: z.number(),
    }),
  ),
  events: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
      visitors: z.number(),
      breakdowns: z.array(
        z.object({
          property: z.string(),
          values: z.array(z.object({ value: z.string(), count: z.number() })),
        }),
      ),
    }),
  ),
});

export type WebAnalyticsRange = z.output<typeof rangeSchema>;
export type WebAnalyticsReport = z.output<typeof webAnalyticsReportSchema>;
