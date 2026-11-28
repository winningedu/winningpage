// AI 텔레메트리 API 계약. 서버(api/_routes/admin/ai-telemetry.ts, ai-telemetry-pricing.ts)는 요청 스키마로 검증하고,
// 브라우저(src/pages/admin/telemetry/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";

export const AI_VIEWS = ["summary", "calls", "citations", "pricing"] as const;

/** 모델 단가표에 둘 수 있는 모델 수와 모델명 길이 한도. */
export const MAX_MODELS = 20;
export const MAX_MODEL_NAME = 100;

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/**
 * GET 쿼리. 여기서는 view 만 거른다. from, to, service 같은 나머지 값은 서버의 ops/query.ts 가 판정한다
 * (구간은 조회자 시간대의 달력 날짜라 시간대가 있어야 판정할 수 있다).
 */
export const telemetryQuery = z.looseObject({
  view: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(AI_VIEWS).default("summary"),
  ),
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isRate(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export type ModelPricing = {
  input_usd_per_1m: number;
  output_usd_per_1m: number;
  cached_input_usd_per_1m: number;
};

export type PricingTable = Record<string, ModelPricing>;

export function toModelPricing(v: unknown): ModelPricing | null {
  if (!isRecord(v)) return null;
  const { input_usd_per_1m, output_usd_per_1m, cached_input_usd_per_1m } = v;
  if (
    !isRate(input_usd_per_1m) ||
    !isRate(output_usd_per_1m) ||
    !isRate(cached_input_usd_per_1m)
  )
    return null;
  return { input_usd_per_1m, output_usd_per_1m, cached_input_usd_per_1m };
}

export function validatePricingBody(
  raw: unknown,
): { ok: true; table: PricingTable } | { ok: false; reason: string } {
  if (!isRecord(raw) || !isRecord(raw.pricing))
    return { ok: false, reason: "pricing 객체가 필요합니다." };
  const entries = Object.entries(raw.pricing);
  if (entries.length > MAX_MODELS)
    return {
      ok: false,
      reason: `모델은 최대 ${MAX_MODELS}개까지 둘 수 있습니다.`,
    };
  const table: PricingTable = {};
  for (const [model, value] of entries) {
    if (model.length < 1 || model.length > MAX_MODEL_NAME)
      return {
        ok: false,
        reason: `모델명은 1자 이상 ${MAX_MODEL_NAME}자 이하여야 합니다.`,
      };
    const pricing = toModelPricing(value);
    if (!pricing)
      return {
        ok: false,
        reason: `${model} 단가는 0 이상의 유한수 3개(input, output, cached_input)여야 합니다.`,
      };
    table[model] = pricing;
  }
  return { ok: true, table };
}

/**
 * PUT 본문. 값 규칙은 validatePricingBody 한 곳에서 판정하고 어기면 pricing 경로의 검증 오류로 바꾼다.
 * 통과한 값은 검증을 마친 단가표다.
 */
export const pricingBody = z
  .object({ pricing: z.record(z.string(), z.unknown()) })
  .transform((value, context) => {
    const parsed = validatePricingBody(value);
    if (!parsed.ok) {
      context.addIssue({
        code: "custom",
        path: ["pricing"],
        message: parsed.reason,
      });
      return z.NEVER;
    }
    return { pricing: parsed.table };
  });

/** 브라우저가 보내는 모양. */
export type PricingBodyInput = z.input<typeof pricingBody>;

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();

// 비율은 분모(호출 수)가 0 이면 서버가 null 로 돌려준다.
export const summaryMetricsSchema = z.object({
  calls: z.number(),
  okCalls: z.number(),
  errorCalls: z.number(),
  retriedCalls: z.number(),
  failureRate: nullableNumber,
  retryRate: nullableNumber,
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
export type SummaryTotals = z.infer<typeof summaryMetricsSchema>;

export const summaryItemSchema = summaryMetricsSchema.extend({
  day: z.string(),
  service: z.string(),
});
export type SummaryItem = z.infer<typeof summaryItemSchema>;

export const summarySchema = z.object({
  from: z.string(),
  to: z.string(),
  items: z.array(summaryItemSchema),
  totals: summaryMetricsSchema,
  pricingConfigured: z.boolean(),
});
export type SummaryResponse = z.infer<typeof summarySchema>;

export const callItemSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  startedAt: z.string(),
  traceId: z.string(),
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
  transportAttempt: z.number(),
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
  latencyMs: z.number(),
  validation: nullableString,
  issueCodes: z.array(z.string()),
});
export type CallItem = z.infer<typeof callItemSchema>;

export const callsPageSchema = z.object({
  items: z.array(callItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type CallsPage = z.infer<typeof callsPageSchema>;

export const citationItemSchema = z.object({
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

export const citationsSchema = z.object({ items: z.array(citationItemSchema) });
export type Citations = z.infer<typeof citationsSchema>;

export const modelPricingSchema = z.object({
  input_usd_per_1m: z.number(),
  output_usd_per_1m: z.number(),
  cached_input_usd_per_1m: z.number(),
});

/** 단가표 읽기. 설정 전이면 pricing 은 {} 이고 updatedAt 은 null 이다. */
export const pricingSchema = z.object({
  pricing: z.record(z.string(), modelPricingSchema),
  updatedAt: nullableString,
});
export type PricingResponse = z.infer<typeof pricingSchema>;

/** 단가표 저장 응답. */
export const pricingSavedSchema = z.object({
  pricing: z.record(z.string(), modelPricingSchema),
});
export type PricingSaved = z.infer<typeof pricingSavedSchema>;
