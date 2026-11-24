// 멘토 신청 화면 테스트 공용. 실제 라우터와 react-query 안에 그리고, 표는 간단한 가짜로 바꿔 끼운다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/toast";
import MentorApplicationsAdmin from "./MentorApplicationsAdmin";

export const BASE = "admin/mentor-applications";
export const PATH = "/admin/mentorApplications";

export const CONFIG = {
  title: "신청 관리",
  searchPlaceholder: "이름 검색",
  columns: [],
};

export const ID1 = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
export const ID2 = "8a4d3b21-6c2f-4d66-8b63-1a7e2a9a0c22";

export const app1 = {
  id: ID1,
  name: "김지원",
  status: "submitted",
  proof_file_path: "m1/proof.pdf",
  proof_file_name: "proof.pdf",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};
export const app2 = { ...app1, id: ID2, name: "박서준" };

export function renderMentor(
  initialPath = PATH,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  const router = createMemoryRouter(
    [
      {
        path: `${PATH}/*`,
        element: <MentorApplicationsAdmin config={CONFIG} />,
      },
    ],
    { initialEntries: [initialPath] },
  );
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return { router, client, ...view };
}
