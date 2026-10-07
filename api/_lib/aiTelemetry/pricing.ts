// 모델 호출 단가표. app_settings 의 jsonb 값을 검증하고 호출 한 건의 추정 금액을 계산한다.
// 단가가 없는 모델은 금액을 null 로 돌려준다. 기본 단가는 두지 않는다.

export type ModelPricing = {
  input_usd_per_1m: number;
  output_usd_per_1m: number;
  cached_input_usd_per_1m: number;
};

export type PricingTable = Record<string, ModelPricing>;

export const AI_MODEL_PRICING_SETTING_KEY = "ai_model_pricing";

const MAX_MODELS = 20;
const MAX_MODEL_NAME = 100;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isRate(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function toModelPricing(v: unknown): ModelPricing | null {
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

export function parsePricingTable(raw: unknown): PricingTable {
  if (!isRecord(raw)) return {};
  const table: PricingTable = {};
  for (const [model, value] of Object.entries(raw)) {
    const pricing = toModelPricing(value);
    if (pricing) table[model] = pricing;
  }
  return table;
}

export { MAX_MODEL_NAME, MAX_MODELS };

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
