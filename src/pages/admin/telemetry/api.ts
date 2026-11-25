// AI 계기판의 서버 호출. 응답 모양은 zod 로 검증하고, 실패는 ApiError 로 받는다.

import { z } from "zod";
import { ApiError, api } from "@/lib/http/client";
import type { PricingTableValue } from "./pricingForm";

const nullableNumber = z.number().nullable();

const summaryItemSchema = z.object({
  day: z.string(),
  service: z.string(),
  calls: z.number(),
  okCalls: z.number(),
  errorCalls: z.number(),
  retriedCalls: z.number(),
  failureRate: z.number(),
  retryRate: z.number(),
  cachedRatio: nullableNumber,
  promptTokens: z.number(),
  outputTokens: z.number(),
  cachedTokens: z.number(),
  thoughtsTokens: z.number(),
  p50Ms: nullableNumber,
  p95Ms: nullableNumber,
  costUsd: nullableNumber,
  models: z.array(z.string()),
});
export type SummaryItem = z.infer<typeof summaryItemSchema>;

const summaryTotalsSchema = summaryItemSchema.omit({
  day: true,
  service: true,
});
export type SummaryTotals = z.infer<typeof summaryTotalsSchema>;

const summarySchema = z.object({
  from: z.string(),
  to: z.string(),
  items: z.array(summaryItemSchema),
  totals: summaryTotalsSchema,
  pricingConfigured: z.boolean(),
});
export type SummaryResponse = z.infer<typeof summarySchema>;

const nullableString = z.string().nullable();

const callItemSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  startedAt: nullableString,
  traceId: nullableString,
  kind: z.string(),
  service: z.string(),
  feature: z.string(),
  step: nullableString,
  // 한 단계 안 병렬 호출 구분 키(예 batch:0, section:2-1). 없으면 null.
  callKey: nullableString,
  targetKind: nullableString,
  targetId: nullableString,
  profileId: nullableString,
  model: z.string(),
  promptVersion: nullableString,
  attempt: z.number(),
  retryReason: nullableString,
  transportAttempt: nullableNumber,
  status: z.string(),
  errorCode: nullableString,
  errorMessage: nullableString,
  finishReason: nullableString,
  tokens: z.object({
    prompt: nullableNumber,
    output: nullableNumber,
    cached: nullableNumber,
    thoughts: nullableNumber,
    total: nullableNumber,
  }),
  inputChars: nullableNumber,
  outputChars: nullableNumber,
  latencyMs: nullableNumber,
  validation: nullableString,
  issueCodes: z.array(z.string()),
});
export type CallItem = z.infer<typeof callItemSchema>;

const callsPageSchema = z.object({
  items: z.array(callItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type CallsPage = z.infer<typeof callsPageSchema>;

const citationItemSchema = z.object({
  resourceId: z.string(),
  title: z.string(),
  knowledgeType: z.string(),
  isActive: z.boolean(),
  hitCount: z.number(),
  citedCount: z.number(),
  lastHitAt: nullableString,
  lastCitedAt: nullableString,
});
export type CitationItem = z.infer<typeof citationItemSchema>;

const citationsSchema = z.object({ items: z.array(citationItemSchema) });

const modelPricingSchema = z.object({
  input_usd_per_1m: z.number(),
  output_usd_per_1m: z.number(),
  cached_input_usd_per_1m: z.number(),
});

const pricingSchema = z.object({
  pricing: z.record(z.string(), modelPricingSchema),
  updatedAt: nullableString,
});
export type PricingResponse = {
  pricing: PricingTableValue;
  updatedAt: string | null;
};

export const telemetryKeys = {
  all: ["admin", "aiTelemetry"] as const,
  summary: (search: string) =>
    [...telemetryKeys.all, "summary", search] as const,
  calls: (search: string) => [...telemetryKeys.all, "calls", search] as const,
  citations: (search: string) =>
    [...telemetryKeys.all, "citations", search] as const,
  pricing: () => [...telemetryKeys.all, "pricing"] as const,
};

const PATH = "admin/ai-telemetry";

export function fetchSummary(search: string, signal?: AbortSignal) {
  return api.get(PATH, { searchParams: search, signal }).json(summarySchema);
}

export function fetchCalls(search: string, signal?: AbortSignal) {
  return api.get(PATH, { searchParams: search, signal }).json(callsPageSchema);
}

export async function fetchCitations(search: string, signal?: AbortSignal) {
  const body = await api
    .get(PATH, { searchParams: search, signal })
    .json(citationsSchema);
  return body.items;
}

export function fetchPricing(signal?: AbortSignal) {
  return api
    .get(PATH, { searchParams: "view=pricing", signal })
    .json(pricingSchema);
}

export function putPricing(pricing: PricingTableValue) {
  return api
    .put("admin/ai-telemetry-pricing", { json: { pricing } })
    .json(z.object({ pricing: z.record(z.string(), modelPricingSchema) }));
}

/** 화면에 보일 실패 문구. 값 검증 실패는 서버가 알려 준 첫 사유가 있으면 그것을 쓴다. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "요청에 실패했습니다.";
  const first = (
    error.problem?.errors as { message?: unknown }[] | undefined
  )?.[0]?.message;
  if (error.code === "VALIDATION_FAILED" && typeof first === "string")
    return first;
  return error.detail;
}
