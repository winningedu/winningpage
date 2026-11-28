// AI 계기판 화면 테스트 공용. 실제 라우터와 react-query 안에 그린다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
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

export function summaryBody(pricingConfigured = true) {
  return {
    from: "2026-09-08T00:00:00.000Z",
    to: "2026-10-07T00:00:00.000Z",
    items: [],
    totals,
    pricingConfigured,
  };
}

export function callsBody(over: Record<string, unknown> = {}) {
  return { items: [], total: 0, page: 1, pageSize: 20, ...over };
}

export function renderTelemetry(
  initialPath = "/admin/telemetry",
  canEdit = true,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/admin/telemetry",
        element: <TelemetryAdmin config={{ title: "AI 호출 계기판" }} />,
      },
    ],
    { initialEntries: [initialPath] },
  );
  const view = render(
    <SectionEditAccessProvider value={canEdit}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SectionEditAccessProvider>,
  );
  /** 지금 주소의 검색 파라미터. */
  const search = () =>
    Object.fromEntries(new URLSearchParams(router.state.location.search));
  return { router, client, search, ...view };
}
