import { getFreshSupabaseAccessTokenOrSignOut } from "@/pages/admin/shared/adminSession";
import type { PricingTableValue } from "./pricingForm";

export type SummaryItem = {
  day: string;
  service: string;
  calls: number;
  okCalls: number;
  errorCalls: number;
  retriedCalls: number;
  failureRate: number;
  retryRate: number;
  cachedRatio: number | null;
  promptTokens: number;
  outputTokens: number;
  cachedTokens: number;
  thoughtsTokens: number;
  p50Ms: number | null;
  p95Ms: number | null;
  costUsd: number | null;
  models: string[];
};

export type SummaryTotals = Omit<SummaryItem, "day" | "service">;

export type SummaryResponse = {
  from: string;
  to: string;
  items: SummaryItem[];
  totals: SummaryTotals;
  pricingConfigured: boolean;
};

export type CallItem = {
  id: string;
  createdAt: string;
  startedAt: string | null;
  traceId: string | null;
  kind: string;
  service: string;
  feature: string;
  step: string | null;
  /** 한 단계 안 병렬 호출 구분 키(예 batch:0, section:2-1). 없으면 null. */
  callKey: string | null;
  targetKind: string | null;
  targetId: string | null;
  profileId: string | null;
  model: string;
  promptVersion: string | null;
  attempt: number;
  retryReason: string | null;
  transportAttempt: number | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  finishReason: string | null;
  tokens: {
    prompt: number | null;
    output: number | null;
    cached: number | null;
    thoughts: number | null;
    total: number | null;
  };
  inputChars: number | null;
  outputChars: number | null;
  latencyMs: number | null;
  validation: string | null;
  issueCodes: string[];
};

export type CallsPage = {
  items: CallItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type CitationItem = {
  resourceId: string;
  title: string;
  knowledgeType: string;
  isActive: boolean;
  hitCount: number;
  citedCount: number;
  lastHitAt: string | null;
  lastCitedAt: string | null;
};

export type PricingResponse = {
  pricing: PricingTableValue;
  updatedAt: string | null;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

async function call<T>(
  url: string,
  init: { method: "GET" | "PUT"; body?: unknown },
): Promise<ApiResult<T>> {
  const accessToken = await getFreshSupabaseAccessTokenOrSignOut();
  const response = await fetch(url, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    const message =
      result?.error?.message ??
      result?.detail ??
      result?.message ??
      `요청에 실패했습니다. (HTTP ${response.status})`;
    return { ok: false, message: String(message) };
  }
  return { ok: true, data: result as T };
}

export function fetchSummary(search: string) {
  return call<SummaryResponse>(`/api/admin/ai-telemetry?${search}`, {
    method: "GET",
  });
}

export function fetchCalls(search: string) {
  return call<CallsPage>(`/api/admin/ai-telemetry?${search}`, {
    method: "GET",
  });
}

export async function fetchCitations(
  search: string,
): Promise<ApiResult<CitationItem[]>> {
  const result = await call<{ items: CitationItem[] }>(
    `/api/admin/ai-telemetry?${search}`,
    { method: "GET" },
  );
  return result.ok ? { ok: true, data: result.data.items } : result;
}

export function fetchPricing() {
  return call<PricingResponse>("/api/admin/ai-telemetry?view=pricing", {
    method: "GET",
  });
}

export function putPricing(pricing: PricingTableValue) {
  return call<{ pricing: PricingTableValue }>(
    "/api/admin/ai-telemetry-pricing",
    { method: "PUT", body: { pricing } },
  );
}
