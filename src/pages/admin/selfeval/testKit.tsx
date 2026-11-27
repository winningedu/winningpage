// 자기평가서 세션 화면 테스트 공용. 실제 라우터와 react-query 안에 그린다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";
import SelfevalSessionsAdmin from "./SelfevalSessionsAdmin";

export const LIST_PATH = "admin/selfeval-sessions";

export const ITEM = {
  id: "s-1",
  profileId: "p-1",
  studentName: "최학생",
  email: "choi@example.com",
  status: "completed",
  currentStep: 6,
  academicYear: 2026,
  semester: 1,
  area: null,
  subject: "국어",
  activityName: null,
  regenerateCount: 0,
  ledgerId: null,
  ledgerReversedAt: null,
  terminal: null,
  progress: [],
  lastActivityAt: "2026-11-24T00:00:00.000Z",
  completedAt: null,
};

export function listBody(over: Record<string, unknown> = {}) {
  return { items: [ITEM], total: 1, page: 1, pageSize: 20, ...over };
}

export function detailBody(over: Record<string, unknown> = {}) {
  return {
    session: {
      id: "s-1",
      profile_id: "p-1",
      status: "completed",
      current_step: 6,
      ledger_id: null,
      ledger_reversed_at: null,
      step_state: {},
    },
    studentName: "최학생",
    email: "choi@example.com",
    terminal: null,
    progress: [{ step: "1", label: "입력", status: "done", attempts: 1 }],
    activities: [
      {
        activityRecordId: "abcdef1234567890",
        role: "core",
        fitScore: null,
        analysisSource: null,
      },
    ],
    reports: [
      {
        id: "r-1",
        type: "final",
        revision: 2,
        score: 80,
        createdAt: "2026-11-02T00:00:00Z",
      },
    ],
    ...over,
  };
}

// 종결되어 복구할 수 있는 세션
export const ARCHIVED_ITEM = {
  ...ITEM,
  studentName: "김학생",
  email: "kim@example.com",
  status: "archived",
  terminal: {
    reason: "generation_failed",
    step: "3",
    at: "2026-10-07T01:00:00Z",
  },
};

export function archivedDetail() {
  return detailBody({
    session: {
      id: "s-1",
      status: "archived",
      current_step: 6,
      ledger_id: null,
      ledger_reversed_at: null,
    },
    studentName: "김학생",
    email: "kim@example.com",
    terminal: ARCHIVED_ITEM.terminal,
  });
}

export function renderSelfeval(
  initialPath = "/admin/selfevalSessions",
  canEdit = true,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/admin/selfevalSessions/*",
        element: <SelfevalSessionsAdmin config={{ title: "자기평가" }} />,
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
