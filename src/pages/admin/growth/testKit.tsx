// 성장설계 화면 테스트 공용. 실제 라우터와 react-query 안에 그린다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import GrowthReportsAdmin from "./GrowthReportsAdmin";
import { GROWTH_REPORTS_PATH } from "./paths";

export const LIST = "admin/growth-reports";
export const detailPath = (id: string) => `${LIST}/${id}`;

export function reportItem(over: Record<string, unknown> = {}) {
  return {
    id: "r-1",
    profileId: "p-1",
    studentName: "김학생",
    email: "kim@example.com",
    status: "completed",
    currentStep: 8,
    track: "인문",
    issuedAt: null,
    lastActivityAt: "2026-11-24T00:00:00.000Z",
    ledgerId: null,
    ledgerReversedAt: null,
    terminal: null,
    progress: [],
    ...over,
  };
}

export function listBody(items: unknown[] = [reportItem()], total?: number) {
  return { items, total: total ?? items.length, page: 1, pageSize: 20 };
}

export const archivedItem = reportItem({
  status: "archived",
  terminal: {
    reason: "generation_failed",
    step: 3,
    at: "2026-10-07T01:00:00Z",
  },
});

export function renderGrowth(
  initialPath = GROWTH_REPORTS_PATH,
  canEdit = true,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/admin/growthReports/*",
        element: <GrowthReportsAdmin config={{ title: "성장 리포트" }} />,
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
  return { router, client, ...view };
}
