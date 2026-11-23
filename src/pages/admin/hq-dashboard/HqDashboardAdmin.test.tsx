import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";

vi.mock("./TenantOverview", () => ({
  default: ({ onSelectTenant }: { onSelectTenant: (id: string) => void }) => (
    <button type="button" onClick={() => onSelectTenant("t 9")}>
      기관 고르기
    </button>
  ),
}));

import HqDashboardAdmin from "./HqDashboardAdmin";

test("기관을 고르면 그 기관과 읽기 전용 사유를 미리 고른 대행 고르기 화면으로 간다(Q4)", async () => {
  const router = createMemoryRouter(
    [
      { path: "/admin/hqDashboard", element: <HqDashboardAdmin /> },
      { path: "/teacher/proxy", element: <p>대행 고르기</p> },
    ],
    { initialEntries: ["/admin/hqDashboard"] },
  );
  render(<RouterProvider router={router} />);
  expect(screen.getByRole("heading", { name: "대시보드" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "기관 고르기" }));
  expect(await screen.findByText("대행 고르기")).toBeTruthy();
  expect(router.state.location.pathname).toBe("/teacher/proxy");
  expect(router.state.location.search).toBe("?tenant=t+9&reason=read_only");
});
