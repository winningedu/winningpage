// 방문 분석 화면의 데이터 호출. Vercel 토큰은 서버에만 있어 /api/admin/web-analytics 로만 읽는다.

import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";

export interface WebAnalyticsRange {
  from: string;
  to: string;
}

export interface WebAnalyticsReport {
  range: WebAnalyticsRange;
  totals: { pageviews: number; visitors: number };
  topPages: { path: string; pageviews: number; visitors: number }[];
  events: {
    name: string;
    count: number;
    visitors: number;
    breakdowns: {
      property: string;
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
