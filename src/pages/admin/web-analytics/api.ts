// 방문 분석 화면의 데이터 호출. Vercel 토큰은 서버에만 있어 /api/admin/web-analytics 로만 읽는다.

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { AnalyticsEventMap, AnalyticsEventName } from "@/lib/analytics";
import { api } from "@/lib/http/client";

// 이벤트 이름과 속성은 수집 쪽 src/lib/analytics.ts 가 정본이다(서버 report.test.ts 가 서버 목록과 맞춰 잠근다).
export type WebAnalyticsEventName = AnalyticsEventName;

type EventProperties = {
  [K in AnalyticsEventName]: AnalyticsEventMap[K] extends undefined
    ? never
    : keyof AnalyticsEventMap[K];
};

export type WebAnalyticsProperty = EventProperties[AnalyticsEventName];

/** 속성 하나가 가질 수 있는 값 전체(여러 이벤트에 걸친 합집합). */
export type WebAnalyticsPropertyValue<P extends WebAnalyticsProperty> = {
  [K in AnalyticsEventName]: NonNullable<AnalyticsEventMap[K]> extends Record<
    P,
    infer V extends string
  >
    ? V
    : never;
}[AnalyticsEventName];

export interface WebAnalyticsRange {
  from: string;
  to: string;
}

export interface WebAnalyticsReport {
  range: WebAnalyticsRange;
  totals: { pageviews: number; visitors: number };
  topPages: { path: string; pageviews: number; visitors: number }[];
  events: {
    name: WebAnalyticsEventName;
    count: number;
    visitors: number;
    breakdowns: {
      property: WebAnalyticsProperty;
      values: { value: string; count: number }[];
    }[];
  }[];
}

// 이벤트 이름과 속성의 정본은 위 타입(src/lib/analytics.ts)이라 응답 스키마는 문자열만 확인하고 타입으로 좁힌다.
const eventNameSchema = z.custom<WebAnalyticsEventName>(
  (value) => typeof value === "string",
);
const propertySchema = z.custom<WebAnalyticsProperty>(
  (value) => typeof value === "string",
);

const webAnalyticsReportSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
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
      name: eventNameSchema,
      count: z.number(),
      visitors: z.number(),
      breakdowns: z.array(
        z.object({
          property: propertySchema,
          values: z.array(z.object({ value: z.string(), count: z.number() })),
        }),
      ),
    }),
  ),
}) satisfies z.ZodType<WebAnalyticsReport>;

export function webAnalyticsQueryOptions(range: WebAnalyticsRange) {
  return queryOptions({
    queryKey: ["admin", "webAnalytics", range.from, range.to],
    queryFn: ({ signal }) =>
      api
        .get("admin/web-analytics", {
          searchParams: { from: range.from, to: range.to },
          signal,
        })
        .json(webAnalyticsReportSchema),
  });
}
