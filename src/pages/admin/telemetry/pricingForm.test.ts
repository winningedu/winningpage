import { describe, expect, test } from "vitest";
import {
  emptyPricingRow,
  fromPricing,
  MODEL_PLACEHOLDERS,
  type PricingRow,
  toPricingBody,
} from "./pricingForm";

const row = (over: Partial<PricingRow>): PricingRow => ({
  ...emptyPricingRow(),
  ...over,
});

describe("emptyPricingRow", () => {
  test("모든 칸이 빈 문자열이다(값을 미리 채우지 않는다)", () => {
    expect(emptyPricingRow()).toEqual({
      model: "",
      input: "",
      cachedInput: "",
      output: "",
    });
  });

  test("모델명 예시는 placeholder 후보로만 둔다", () => {
    expect(MODEL_PLACEHOLDERS).toEqual([
      "gemini-2.5-flash",
      "gemini-embedding-2",
    ]);
  });
});

describe("fromPricing", () => {
  test("단가표를 행 배열로 바꾼다", () => {
    const rows = fromPricing({
      "m-1": {
        input_usd_per_1m: 0.3,
        output_usd_per_1m: 2.5,
        cached_input_usd_per_1m: 0.03,
      },
    });
    expect(rows).toEqual([
      { model: "m-1", input: "0.3", cachedInput: "0.03", output: "2.5" },
    ]);
  });

  test("단가표가 비면 행도 없다", () => {
    expect(fromPricing({})).toEqual([]);
  });
});

describe("toPricingBody", () => {
  test("행을 숫자로 바꿔 단가표를 만든다", () => {
    const result = toPricingBody([
      row({ model: " m-1 ", input: "0.3", cachedInput: "0.03", output: "2.5" }),
    ]);
    expect(result).toEqual({
      ok: true,
      pricing: {
        "m-1": {
          input_usd_per_1m: 0.3,
          output_usd_per_1m: 2.5,
          cached_input_usd_per_1m: 0.03,
        },
      },
    });
  });

  test("완전히 빈 행은 건너뛴다", () => {
    const result = toPricingBody([emptyPricingRow()]);
    expect(result).toEqual({ ok: true, pricing: {} });
  });

  test("숫자가 아니거나 음수인 칸은 오류 메시지를 돌려준다", () => {
    const bad = toPricingBody([
      row({ model: "m", input: "abc", cachedInput: "0", output: "1" }),
    ]);
    expect(bad.ok).toBe(false);
    const negative = toPricingBody([
      row({ model: "m", input: "-1", cachedInput: "0", output: "1" }),
    ]);
    expect(negative.ok).toBe(false);
  });

  test("값이 비어 있는 칸이 있으면 오류다", () => {
    const result = toPricingBody([
      row({ model: "m", input: "1", cachedInput: "", output: "1" }),
    ]);
    expect(result.ok).toBe(false);
  });

  test("모델명 없이 값만 있으면 오류다", () => {
    const result = toPricingBody([
      row({ input: "1", cachedInput: "1", output: "1" }),
    ]);
    expect(result.ok).toBe(false);
  });

  test("같은 모델명이 두 번 나오면 오류다", () => {
    const r = row({ model: "m", input: "1", cachedInput: "1", output: "1" });
    expect(toPricingBody([r, r]).ok).toBe(false);
  });
});
