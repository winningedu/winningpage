import { describe, expect, it } from "vitest";
import {
  estimateCostUsd,
  parsePricingTable,
  validatePricingBody,
} from "./pricing.js";

const good = {
  input_usd_per_1m: 0.3,
  output_usd_per_1m: 2.5,
  cached_input_usd_per_1m: 0.03,
};

describe("parsePricingTable", () => {
  it("올바른 모델 단가만 남긴다", () => {
    const table = parsePricingTable({
      "gemini-a": good,
      "bad-negative": { ...good, input_usd_per_1m: -1 },
      "bad-missing": { input_usd_per_1m: 1, output_usd_per_1m: 1 },
      "bad-string": { ...good, output_usd_per_1m: "2" },
      "bad-nan": { ...good, output_usd_per_1m: Number.NaN },
      "bad-null": null,
    });
    expect(table).toEqual({ "gemini-a": good });
  });

  it("객체가 아니면 빈 표를 돌려준다", () => {
    expect(parsePricingTable(null)).toEqual({});
    expect(parsePricingTable([good])).toEqual({});
    expect(parsePricingTable("x")).toEqual({});
    expect(parsePricingTable({})).toEqual({});
  });
});

describe("estimateCostUsd", () => {
  const table = {
    "gemini-a": {
      input_usd_per_1m: 1,
      output_usd_per_1m: 4,
      cached_input_usd_per_1m: 0.25,
    },
  };
  const usage = (
    o: Partial<
      Record<
        "promptTokens" | "outputTokens" | "cachedTokens" | "thoughtsTokens",
        number | null
      >
    >,
  ) => ({
    promptTokens: null,
    outputTokens: null,
    cachedTokens: null,
    thoughtsTokens: null,
    ...o,
  });

  it("캐시 토큰은 입력에서 빼고 캐시 단가로 계산한다", () => {
    // 입력 600k x 1 + 캐시 400k x 0.25 = 0.6 + 0.1
    const cost = estimateCostUsd(
      "gemini-a",
      usage({ promptTokens: 1_000_000, cachedTokens: 400_000 }),
      table,
    );
    expect(cost).toBe(0.7);
  });

  it("사고 토큰은 출력 단가로 계산한다", () => {
    const cost = estimateCostUsd(
      "gemini-a",
      usage({ outputTokens: 100_000, thoughtsTokens: 150_000 }),
      table,
    );
    expect(cost).toBe(1);
  });

  it("단가가 없는 모델은 null", () => {
    expect(
      estimateCostUsd("unknown", usage({ promptTokens: 10 }), table),
    ).toBeNull();
  });

  it("null 토큰은 0 으로 보고 소수 6자리로 반올림한다", () => {
    expect(estimateCostUsd("gemini-a", usage({}), table)).toBe(0);
    expect(estimateCostUsd("gemini-a", usage({ promptTokens: 1 }), table)).toBe(
      0.000001,
    );
  });

  it("캐시가 프롬프트보다 커도 입력 과금은 음수가 되지 않는다", () => {
    const cost = estimateCostUsd(
      "gemini-a",
      usage({ promptTokens: 100, cachedTokens: 1_000_000 }),
      table,
    );
    expect(cost).toBe(0.25);
  });
});

describe("validatePricingBody", () => {
  it("올바른 바디는 표를 돌려준다", () => {
    const r = validatePricingBody({ pricing: { "gemini-a": good } });
    expect(r).toEqual({ ok: true, table: { "gemini-a": good } });
  });

  it("빈 표도 허용한다", () => {
    expect(validatePricingBody({ pricing: {} })).toEqual({
      ok: true,
      table: {},
    });
  });

  it.each([
    ["바디가 객체가 아님", null],
    ["pricing 누락", {}],
    ["pricing 이 배열", { pricing: [] }],
    ["모델명이 빈 문자열", { pricing: { "": good } }],
    ["모델명 100자 초과", { pricing: { ["x".repeat(101)]: good } }],
    ["값이 음수", { pricing: { a: { ...good, input_usd_per_1m: -0.1 } } }],
    ["값이 문자열", { pricing: { a: { ...good, output_usd_per_1m: "1" } } }],
    [
      "값이 무한",
      {
        pricing: {
          a: { ...good, cached_input_usd_per_1m: Number.POSITIVE_INFINITY },
        },
      },
    ],
    ["값 필드 누락", { pricing: { a: { input_usd_per_1m: 1 } } }],
    [
      "모델 20개 초과",
      {
        pricing: Object.fromEntries(
          Array.from({ length: 21 }, (_, i) => [`m${i}`, good]),
        ),
      },
    ],
  ])("거부: %s", (_name, body) => {
    const r = validatePricingBody(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });

  it("모델 20개는 허용한다", () => {
    const pricing = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`m${i}`, good]),
    );
    expect(validatePricingBody({ pricing }).ok).toBe(true);
  });
});
