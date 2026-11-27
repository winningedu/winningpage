// 심화탐구 화면 테스트 공용. 실제 라우터와 react-query 안에 그린다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import InquirySessionsAdmin from "./InquirySessionsAdmin";
import { INQUIRY_SESSIONS_PATH } from "./paths";

export const LIST = "admin/inquiry-sessions";
export const detailPath = (id: string) => `${LIST}/${id}`;

export function sessionItem(over: Record<string, unknown> = {}) {
  return {
    id: "s-1",
    profileId: "p-1",
    studentName: "김학생",
    email: "kim@example.com",
    status: "completed",
    currentStep: 6,
    subject: "수학",
    topicTitle: "확률",
    completedAt: null,
    lastActivityAt: "2026-11-24T00:00:00.000Z",
    ledgerId: null,
    ledgerReversedAt: null,
    terminal: null,
    generation: { modes: {}, terminal: null },
    evaluationCount: 0,
    topicRoundCount: 0,
    ...over,
  };
}

export function listBody(items: unknown[] = [sessionItem()], total?: number) {
  return { items, total: total ?? items.length, page: 1, pageSize: 20 };
}

const terminal = {
  reason: "generation_failed",
  mode: "topic_recommendation",
  at: "2026-10-07T01:00:00Z",
};

export const archivedItem = sessionItem({
  status: "archived",
  terminal,
  generation: {
    modes: {
      topic_recommendation: {
        status: "failed",
        attempts: 2,
        startedAt: null,
        finishedAt: null,
        issues: ["형식 오류"],
      },
    },
    terminal,
  },
});

export function renderInquiry(
  initialPath = INQUIRY_SESSIONS_PATH,
  canEdit = true,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/admin/inquirySessions/*",
        element: <InquirySessionsAdmin config={{ title: "탐구 세션" }} />,
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
