// 평가 화면 테스트 공용. 실제 라우터와 react-query 안에 그린다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SectionEditAccessProvider } from "@/pages/admin/shared/sectionEditAccess";

export const prod = {
  matchThreshold: 0.5,
  rrfK: 60,
  fullTextWeight: 1,
  semanticWeight: 1,
  matchCount: 12,
};

export const goldenRow = {
  id: "q1",
  knowledge_type: "topic_pattern" as const,
  grade: "고2",
  subject: "물리학Ⅰ",
  career: "기계공학",
  selected_topic: "마찰력 실험",
  assessment_info: null,
  note: null,
  expected_resource_ids: ["r1", "r2"],
  is_active: true,
  created_at: "2026-10-07T00:00:00Z",
};

export function renderInRouter(
  element: ReactElement,
  initialPath = "/evals",
  canEdit = true,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([{ path: "/evals", element }], {
    initialEntries: [initialPath],
  });
  const view = render(
    <SectionEditAccessProvider value={canEdit}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SectionEditAccessProvider>,
  );
  return { router, client, ...view };
}
