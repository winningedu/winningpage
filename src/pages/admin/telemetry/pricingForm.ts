// 단가 탭 폼 상태와 서버 바디 변환. 기본 단가는 두지 않고 모든 칸은 빈 문자열로 시작한다.
export type PricingRow = {
  model: string;
  input: string;
  cachedInput: string;
  output: string;
};

export type ModelPricingValue = {
  input_usd_per_1m: number;
  output_usd_per_1m: number;
  cached_input_usd_per_1m: number;
};

export type PricingTableValue = Record<string, ModelPricingValue>;

// 모델명 칸이 비어 있을 때 보이는 안내용 예시. 값으로 채우지 않는다.
export const MODEL_PLACEHOLDERS = ["gemini-2.5-flash", "gemini-embedding-2"];

export function emptyPricingRow(): PricingRow {
  return { model: "", input: "", cachedInput: "", output: "" };
}

export function fromPricing(pricing: PricingTableValue): PricingRow[] {
  return Object.entries(pricing).map(([model, p]) => ({
    model,
    input: String(p.input_usd_per_1m),
    cachedInput: String(p.cached_input_usd_per_1m),
    output: String(p.output_usd_per_1m),
  }));
}

function parseRate(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function toPricingBody(
  rows: PricingRow[],
): { ok: true; pricing: PricingTableValue } | { ok: false; message: string } {
  const pricing: PricingTableValue = {};
  for (const [index, r] of rows.entries()) {
    const model = r.model.trim();
    const isBlank =
      !model && !r.input.trim() && !r.cachedInput.trim() && !r.output.trim();
    if (isBlank) continue;
    const line = `${index + 1}번째 행`;
    if (!model) return { ok: false, message: `${line}의 모델명을 입력하세요.` };
    if (Object.hasOwn(pricing, model))
      return { ok: false, message: `${line}의 모델명이 중복됩니다.` };
    const input = parseRate(r.input);
    const cached = parseRate(r.cachedInput);
    const output = parseRate(r.output);
    if (input === null || cached === null || output === null)
      return {
        ok: false,
        message: `${line}의 단가는 0 이상의 숫자로 모두 입력하세요.`,
      };
    pricing[model] = {
      input_usd_per_1m: input,
      output_usd_per_1m: output,
      cached_input_usd_per_1m: cached,
    };
  }
  return { ok: true, pricing };
}
