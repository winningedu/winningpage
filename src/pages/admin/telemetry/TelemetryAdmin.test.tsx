import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api", () => ({
  fetchSummary: vi.fn(),
  fetchCalls: vi.fn(),
  fetchCitations: vi.fn(),
  fetchPricing: vi.fn(),
  putPricing: vi.fn(),
}));

import * as api from "./api";
import TelemetryAdmin from "./TelemetryAdmin";

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

describe("TelemetryAdmin", () => {
  test("요약 탭은 totals 카드를 그린다", async () => {
    vi.mocked(api.fetchSummary).mockResolvedValue(summaryResult(true));
    render(<TelemetryAdmin config={{ title: "AI 호출 계기판" }} />);
    expect(await screen.findByText("1,234")).toBeTruthy();
    expect(screen.getByText("2.8%")).toBeTruthy();
    expect(screen.getByText("41.5%")).toBeTruthy();
    expect(screen.getByText("4,200")).toBeTruthy();
    expect(screen.getByText("조회된 호출이 없습니다.")).toBeTruthy();
  });

  test("단가가 설정되지 않았으면 안내 띠를 보여준다", async () => {
    vi.mocked(api.fetchSummary).mockResolvedValue(summaryResult(false));
    render(<TelemetryAdmin config={{ title: "AI 호출 계기판" }} />);
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
    render(<TelemetryAdmin config={{ title: "AI 호출 계기판" }} />);
    await screen.findByText("1,234");
    fireEvent.click(screen.getByRole("button", { name: "호출 목록" }));
    await waitFor(() => expect(api.fetchCalls).toHaveBeenCalled());
    expect(vi.mocked(api.fetchCalls).mock.calls[0]?.[0]).toContain(
      "view=calls",
    );
  });

  test("호출 목록은 호출 키 열을 그리고 상세에도 보여준다", async () => {
    vi.mocked(api.fetchSummary).mockResolvedValue(summaryResult(true));
    vi.mocked(api.fetchCalls).mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "c1",
            createdAt: "2026-10-07T01:00:00Z",
            startedAt: "2026-10-07T01:00:00Z",
            traceId: "t1",
            kind: "generate",
            service: "growth",
            feature: "report_step",
            step: "6",
            callKey: "section:2-1",
            targetKind: null,
            targetId: null,
            profileId: null,
            model: "gemini-2.5-flash",
            promptVersion: null,
            attempt: 2,
            retryReason: "truncated",
            transportAttempt: 1,
            status: "ok",
            errorCode: null,
            errorMessage: null,
            finishReason: "STOP",
            tokens: {
              prompt: 10,
              output: 5,
              cached: null,
              thoughts: null,
              total: 15,
            },
            inputChars: null,
            outputChars: null,
            latencyMs: 100,
            validation: "ok",
            issueCodes: [],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    });
    render(<TelemetryAdmin config={{ title: "AI 호출 계기판" }} />);
    await screen.findByText("1,234");
    fireEvent.click(screen.getByRole("button", { name: "호출 목록" }));
    expect(await screen.findByText("section:2-1")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "호출" })).toBeTruthy();
    fireEvent.click(screen.getByText("section:2-1"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("callKey");
    expect(dialog.textContent).toContain("section:2-1");
  });
});
