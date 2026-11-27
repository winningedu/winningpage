// 서비스이용횟수조정 화면 테스트 공용. 실제 라우터와 react-query 안에 그린다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SectionEditAccessProvider } from "../shared/sectionEditAccess";
import ServiceCreditAdjustAdmin from "./ServiceCreditAdjustAdmin";

export const STUDENT_ID = "123e4567-e89b-42d3-a456-426614174000";

export function creditRow(
  programKey: string,
  label: string,
  over: Record<string, unknown> = {},
) {
  return {
    programKey,
    label,
    periodBased: programKey === "target",
    liveCount: 0,
    quotaTotal: 0,
    quotaUsed: 0,
    quotaRemaining: 0,
    expiresAt: null,
    ...over,
  };
}

export const ROWS = [
  creditRow("diagnose", "학습진단 서비스"),
  creditRow("target", "목표관리 서비스"),
  creditRow("growth", "위닝 성장설계", {
    liveCount: 1,
    quotaTotal: 5,
    quotaUsed: 2,
    quotaRemaining: 3,
    expiresAt: "2027-01-01T00:00:00.000Z",
  }),
  creditRow("suhaeng", "AI 수행평가 서비스"),
  creditRow("inquiry", "위닝 심화탐구"),
  creditRow("selfeval", "위닝 자기평가서"),
];

export const SUMMARY = {
  student: { id: STUDENT_ID, name: "김학생", email: "kim@example.com" },
  items: ROWS,
};

export function searchBody(
  items: {
    id: string;
    name: string | null;
    email: string | null;
    isAdmin?: boolean;
  }[],
) {
  return { items: items.map((i) => ({ isAdmin: false, ...i })) };
}

export function renderCredit(
  initialPath = "/admin/serviceCreditAdjust",
  canEdit = true,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/admin/serviceCreditAdjust/*",
        element: (
          <ServiceCreditAdjustAdmin config={{ title: "서비스이용횟수조정" }} />
        ),
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
