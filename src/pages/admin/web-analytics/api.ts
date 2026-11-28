// 방문 분석 화면의 데이터 호출. Vercel 토큰은 서버에만 있어 /api/admin/web-analytics 로만 읽는다.

import { queryOptions } from "@tanstack/react-query";
import type { AnalyticsEventMap, AnalyticsEventName } from "@/lib/analytics";
import { api } from "@/lib/http/client";
import {
  type WebAnalyticsRange,
  webAnalyticsReportSchema,
} from "../../../../shared/web-analytics/contract.js";

// 이벤트 이름과 속성 키는 shared/web-analytics/events.ts 의 목록이 정본이고, 속성 값 타입은 수집 쪽 src/lib/analytics.ts 가 정한다(서버 report.test.ts 가 맞춰 잠근다).
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

export type {
  WebAnalyticsRange,
  WebAnalyticsReport,
} from "../../../../shared/web-analytics/contract.js";

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
