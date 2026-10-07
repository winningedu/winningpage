import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./aiTelemetryApi", () => ({
  fetchSummary: vi.fn(),
  fetchCalls: vi.fn(),
  fetchCitations: vi.fn(),
  fetchPricing: vi.fn(),
  putPricing: vi.fn(),
}));

import AiTelemetryAdmin from "./AiTelemetryAdmin";
import * as api from "./aiTelemetryApi";

const totals = {
  calls: 1234,
  okCalls: 1200,
  errorCalls: 34,
  retriedCalls: 10,
  failureRate: 2.8,
  retryRate: 0.8,
  cachedRatio: 41.5,
  promptTokens: 1000,
  outputTokens: 500,
  cachedTokens: 400,
  thoughtsTokens: 0,
  p50Ms: 800,
  p95Ms: 4200,
  costUsd: null,
  models: [],
};

function summaryResult(pricingConfigured: boolean) {
  return {
    ok: true as const,
    data: {
      from: "2026-09-08",
      to: "2026-10-07",
      items: [],
      totals,
      pricingConfigured,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("AiTelemetryAdmin", () => {
  test("요약 탭은 totals 카드를 그린다", async () => {
    vi.mocked(api.fetchSummary).mockResolvedValue(summaryResult(true));
    render(<AiTelemetryAdmin config={{ title: "AI 호출 계기판" }} />);
    expect(await screen.findByText("1,234")).toBeTruthy();
    expect(screen.getByText("2.8%")).toBeTruthy();
    expect(screen.getByText("41.5%")).toBeTruthy();
    expect(screen.getByText("4,200")).toBeTruthy();
    expect(screen.getByText("조회된 호출이 없습니다.")).toBeTruthy();
  });

  test("단가가 설정되지 않았으면 안내 띠를 보여준다", async () => {
    vi.mocked(api.fetchSummary).mockResolvedValue(summaryResult(false));
    render(<AiTelemetryAdmin config={{ title: "AI 호출 계기판" }} />);
    expect(
      await screen.findByText(
        "단가가 없어 금액은 비워 둡니다. 단가 탭에서 입력하세요.",
      ),
    ).toBeTruthy();
  });

  test("호출 목록 탭으로 바꾸면 fetchCalls 를 부른다", async () => {
    vi.mocked(api.fetchSummary).mockResolvedValue(summaryResult(true));
    vi.mocked(api.fetchCalls).mockResolvedValue({
      ok: true,
      data: { items: [], total: 0, page: 1, pageSize: 20 },
    });
    render(<AiTelemetryAdmin config={{ title: "AI 호출 계기판" }} />);
    await screen.findByText("1,234");
    fireEvent.click(screen.getByRole("button", { name: "호출 목록" }));
    await waitFor(() => expect(api.fetchCalls).toHaveBeenCalled());
    expect(vi.mocked(api.fetchCalls).mock.calls[0]?.[0]).toContain(
      "view=calls",
    );
  });
});
