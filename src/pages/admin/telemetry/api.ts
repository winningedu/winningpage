// AI 계기판의 서버 호출. 응답 모양은 zod 로 검증하고, 실패는 ApiError 로 받는다.

import { ApiError, api } from "@/lib/http/client";
import {
  callsPageSchema,
  citationsSchema,
  type PricingBodyInput,
  pricingSavedSchema,
  pricingSchema,
  summarySchema,
} from "../../../../shared/ai-telemetry/contract.js";
import type { PricingTableValue } from "./pricingForm";

export type {
  CallItem,
  CallsPage,
  CitationItem,
  PricingResponse,
  SummaryItem,
  SummaryResponse,
} from "../../../../shared/ai-telemetry/contract.js";

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
    .put("admin/ai-telemetry-pricing", {
      json: { pricing } satisfies PricingBodyInput,
    })
    .json(pricingSavedSchema);
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
