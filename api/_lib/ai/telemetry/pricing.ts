// 모델 호출 단가표. app_settings 의 jsonb 값을 검증하고 호출 한 건의 추정 금액을 계산한다.
// 단가가 없는 모델은 금액을 null 로 돌려준다. 기본 단가는 두지 않는다.

import {
  MAX_MODEL_NAME,
  MAX_MODELS,
  type ModelPricing,
  type PricingTable,
  toModelPricing,
  validatePricingBody,
} from "../../../../shared/ai-telemetry/contract.js";

export type { ModelPricing, PricingTable };
export { MAX_MODEL_NAME, MAX_MODELS, validatePricingBody };

export const AI_MODEL_PRICING_SETTING_KEY = "ai_model_pricing";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parsePricingTable(raw: unknown): PricingTable {
  if (!isRecord(raw)) return {};
  const table: PricingTable = {};
  for (const [model, value] of Object.entries(raw)) {
    const pricing = toModelPricing(value);
    if (pricing) table[model] = pricing;
  }
  return table;
}

export type TokenUsage = {
  promptTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  thoughtsTokens: number | null;
};

export function estimateCostUsd(
  model: string,
  usage: TokenUsage,
  table: PricingTable,
): number | null {
  const price = Object.hasOwn(table, model) ? table[model] : undefined;
  if (!price) return null;
  const prompt = usage.promptTokens ?? 0;
  const cached = usage.cachedTokens ?? 0;
  const output = (usage.outputTokens ?? 0) + (usage.thoughtsTokens ?? 0);
  const freshInput = Math.max(prompt - cached, 0);
  const usd =
    (freshInput * price.input_usd_per_1m +
      cached * price.cached_input_usd_per_1m +
      output * price.output_usd_per_1m) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
