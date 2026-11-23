// 방문 분석 화면의 데이터 호출. Vercel 토큰은 서버에만 있어 /api/admin/web-analytics 로만 읽는다.

import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";

// 서버 api/_lib/web-analytics/report.ts 의 WEB_ANALYTICS_EVENTS 와 같은 이름과 속성이다.
export type WebAnalyticsEventName =
  | "signup_complete"
  | "service_start"
  | "diagnosis_complete"
  | "checkout_start"
  | "payment_complete"
  | "consult_apply"
  | "kakao_inquiry_click"
  | "report_export"
  | "paywall_cta_click"
  | "ai_regenerate";

export type WebAnalyticsProperty =
  | "member_type"
  | "service"
  | "method"
  | "location"
  | "step";

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
