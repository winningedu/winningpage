// 방문 분석 화면의 데이터 호출. Vercel 토큰은 서버에만 있어 /api/admin/web-analytics 로만 읽는다.

import type { AnalyticsEventMap, AnalyticsEventName } from "@/lib/analytics";
import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";

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

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export async function fetchWebAnalytics(
  range: WebAnalyticsRange,
): Promise<ApiResult<WebAnalyticsReport>> {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
  const response = await fetch(`/api/admin/web-analytics?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    return {
      ok: false,
      message:
        result?.error?.message ??
        `방문 분석을 불러오지 못했어요. (HTTP ${response.status})`,
    };
  }
  return { ok: true, data: result as WebAnalyticsReport };
}
