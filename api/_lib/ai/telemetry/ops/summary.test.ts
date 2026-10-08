import { describe, expect, it } from "vitest";
import type { PricingTable } from "../pricing.js";
import { aggregateDaily, type DailySummaryRow, totalsOf } from "./summary.js";

const pricing: PricingTable = {
  "m-a": {
    input_usd_per_1m: 1,
    output_usd_per_1m: 4,
    cached_input_usd_per_1m: 0.25,
  },
  "m-b": {
    input_usd_per_1m: 2,
    output_usd_per_1m: 8,
    cached_input_usd_per_1m: 0.5,
  },
};

function row(o: Partial<DailySummaryRow>): DailySummaryRow {
  return {
    day: "2026-10-01",
    service: "growth",
    model: "m-a",
    calls: 10,
    ok_calls: 8,
    error_calls: 2,
    retried_calls: 1,
    prompt_tokens: 1_000_000,
    output_tokens: 100_000,
    cached_tokens: 400_000,
    thoughts_tokens: 0,
    p50_ms: 100,
    p95_ms: 300,
    avg_ms: 120,
    ...o,
  };
}

describe("aggregateDaily", () => {
  it("같은 (day, service) 의 두 모델을 합산한다", () => {
    const items = aggregateDaily(
      [
        row({}),
        row({
          model: "m-b",
          calls: 30,
          ok_calls: 30,
          error_calls: 0,
          retried_calls: 3,
          prompt_tokens: 0,
          output_tokens: 0,
          cached_tokens: 0,
          p50_ms: 200,
          p95_ms: 900,
        }),
      ],
      pricing,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      day: "2026-10-01",
      service: "growth",
      calls: 40,
      okCalls: 38,
      errorCalls: 2,
      failureRate: 0.05,
      retriedCalls: 4,
      retryRate: 0.1,
      promptTokens: 1_000_000,
      outputTokens: 100_000,
      cachedTokens: 400_000,
      thoughtsTokens: 0,
      cachedRatio: 0.4,
      // (100 x 10 + 200 x 30) / 40 = 175
      p50Ms: 175,
      p95Ms: 900,
      // m-a: 600k x 1 + 400k x 0.25 + 100k x 4 = 0.6 + 0.1 + 0.4 = 1.1, m-b: 0
      costUsd: 1.1,
      models: ["m-a", "m-b"],
    });
  });

  it("단가 없는 모델이 섞이면 costUsd 는 null", () => {
    const items = aggregateDaily([row({}), row({ model: "unknown" })], pricing);
    expect(items[0]?.costUsd).toBeNull();
    expect(items[0]).not.toHaveProperty("costPartial");
  });

  it("day 오름차순, service 알파벳 순으로 정렬한다", () => {
    const items = aggregateDaily(
      [
        row({ day: "2026-10-02", service: "goal" }),
        row({ day: "2026-10-01", service: "inquiry" }),
        row({ day: "2026-10-01", service: "growth" }),
      ],
      pricing,
    );
    expect(items.map((i) => `${i.day}/${i.service}`)).toEqual([
      "2026-10-01/growth",
      "2026-10-01/inquiry",
      "2026-10-02/goal",
    ]);
  });

  it("호출이 0이거나 프롬프트 토큰이 0이면 비율은 null", () => {
    const items = aggregateDaily(
      [
        row({
          calls: 0,
          ok_calls: 0,
          error_calls: 0,
          retried_calls: 0,
          prompt_tokens: 0,
          cached_tokens: 0,
        }),
      ],
      pricing,
    );
    expect(items[0]).toMatchObject({
      failureRate: null,
      retryRate: null,
      cachedRatio: null,
      p50Ms: null,
    });
  });
});

describe("totalsOf", () => {
  it("항목 전체를 한 행으로 합산한다", () => {
    const items = aggregateDaily(
      [
        row({}),
        row({
          day: "2026-10-02",
          model: "m-b",
          calls: 10,
          ok_calls: 10,
          error_calls: 0,
          retried_calls: 0,
          p50_ms: 300,
          p95_ms: 500,
        }),
      ],
      pricing,
    );
    const t = totalsOf(items);
    expect(t).toMatchObject({
      calls: 20,
      okCalls: 18,
      errorCalls: 2,
      failureRate: 0.1,
      retriedCalls: 1,
      p50Ms: 200,
      p95Ms: 500,
    });
    // m-a 1.1 + m-b (600k x 2 + 400k x 0.5 + 100k x 8 = 1.2 + 0.2 + 0.8 = 2.2)
    expect(t.costUsd).toBe(3.3);
  });

  it("항목 중 금액 null 이 있으면 합계 금액도 null", () => {
    const items = aggregateDaily(
      [row({}), row({ day: "2026-10-02", model: "x" })],
      pricing,
    );
    expect(totalsOf(items).costUsd).toBeNull();
  });

  it("빈 목록은 0 합계", () => {
    expect(totalsOf([])).toMatchObject({
      calls: 0,
      failureRate: null,
      costUsd: 0,
    });
  });
});
