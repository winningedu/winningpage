// 일별 요약 RPC 결과를 (일자, 서비스) 단위로 합산하고 전체 합계를 낸다.
// 금액은 모델별 단가표로 계산하며, 단가 없는 모델이 하나라도 있으면 그 묶음의 금액은 null 이다.

import type { Database } from "../../../../../src/types/database.types.js";
import { estimateCostUsd, type PricingTable } from "../pricing.js";

export type DailySummaryRow =
  Database["public"]["Functions"]["fn_ai_telemetry_daily_summary"]["Returns"][number];

export type SummaryMetrics = {
  calls: number;
  okCalls: number;
  errorCalls: number;
  failureRate: number | null;
  retriedCalls: number;
  retryRate: number | null;
  promptTokens: number;
  outputTokens: number;
  cachedTokens: number;
  thoughtsTokens: number;
  cachedRatio: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  costUsd: number | null;
  models: string[];
};

export type DailySummaryItem = SummaryMetrics & {
  day: string;
  service: string;
};

function ratio(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 10_000) / 10_000 : null;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

type Part = {
  calls: number;
  p50: number | null;
  p95: number | null;
  cost: number | null;
};

// 부분 합산 결과로 공통 지표를 만든다. 일자별 묶음과 전체 합계가 같은 규칙을 쓴다.
function build(
  sums: Pick<
    SummaryMetrics,
    | "calls"
    | "okCalls"
    | "errorCalls"
    | "retriedCalls"
    | "promptTokens"
    | "outputTokens"
    | "cachedTokens"
    | "thoughtsTokens"
  >,
  parts: Part[],
  models: Iterable<string>,
): SummaryMetrics {
  const weighted = parts.filter((p) => p.p50 !== null && p.calls > 0);
  const weightSum = weighted.reduce((a, p) => a + p.calls, 0);
  const p50Ms =
    weightSum > 0
      ? Math.round(
          weighted.reduce((a, p) => a + (p.p50 as number) * p.calls, 0) /
            weightSum,
        )
      : null;
  const p95s = parts.map((p) => p.p95).filter((v): v is number => v !== null);
  const costs = parts.map((p) => p.cost);
  return {
    ...sums,
    failureRate: ratio(sums.errorCalls, sums.calls),
    retryRate: ratio(sums.retriedCalls, sums.calls),
    cachedRatio: ratio(sums.cachedTokens, sums.promptTokens),
    p50Ms,
    p95Ms: p95s.length > 0 ? Math.max(...p95s) : null,
    costUsd: costs.some((c) => c === null)
      ? null
      : round6(costs.reduce<number>((a, c) => a + (c as number), 0)),
    models: [...new Set(models)].sort(),
  };
}

export function aggregateDaily(
  rows: DailySummaryRow[],
  pricing: PricingTable,
): DailySummaryItem[] {
  const groups = new Map<string, DailySummaryRow[]>();
  for (const r of rows) {
    const key = `${r.day}\u0000${r.service}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const items: DailySummaryItem[] = [];
  for (const list of groups.values()) {
    const sum = (pick: (r: DailySummaryRow) => number) =>
      list.reduce((a, r) => a + pick(r), 0);
    const metrics = build(
      {
        calls: sum((r) => r.calls),
        okCalls: sum((r) => r.ok_calls),
        errorCalls: sum((r) => r.error_calls),
        retriedCalls: sum((r) => r.retried_calls),
        promptTokens: sum((r) => r.prompt_tokens),
        outputTokens: sum((r) => r.output_tokens),
        cachedTokens: sum((r) => r.cached_tokens),
        thoughtsTokens: sum((r) => r.thoughts_tokens),
      },
      list.map((r) => ({
        calls: r.calls,
        p50: r.p50_ms,
        p95: r.p95_ms,
        cost: estimateCostUsd(
          r.model,
          {
            promptTokens: r.prompt_tokens,
            outputTokens: r.output_tokens,
            cachedTokens: r.cached_tokens,
            thoughtsTokens: r.thoughts_tokens,
          },
          pricing,
        ),
      })),
      list.map((r) => r.model),
    );
    const head = list[0];
    if (!head) continue;
    items.push({ day: head.day, service: head.service, ...metrics });
  }

  return items.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.service < b.service ? -1 : a.service > b.service ? 1 : 0),
  );
}

export function totalsOf(items: DailySummaryItem[]): SummaryMetrics {
  const sum = (pick: (i: DailySummaryItem) => number) =>
    items.reduce((a, i) => a + pick(i), 0);
  return build(
    {
      calls: sum((i) => i.calls),
      okCalls: sum((i) => i.okCalls),
      errorCalls: sum((i) => i.errorCalls),
      retriedCalls: sum((i) => i.retriedCalls),
      promptTokens: sum((i) => i.promptTokens),
      outputTokens: sum((i) => i.outputTokens),
      cachedTokens: sum((i) => i.cachedTokens),
      thoughtsTokens: sum((i) => i.thoughtsTokens),
    },
    items.map((i) => ({
      calls: i.calls,
      p50: i.p50Ms,
      p95: i.p95Ms,
      cost: i.costUsd,
    })),
    items.flatMap((i) => i.models),
  );
}
