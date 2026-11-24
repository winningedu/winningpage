// 가드(middleware) 판정과 Admin 청크를 기다리는 동안 관리자 셸 스켈레톤이 보인다.

import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/routeMiddleware", () => ({
  requireAdminMiddleware: vi.fn(() => new Promise<never>(() => {})),
}));
vi.mock("@/components/routeGuards/RouteGuardUi", () => ({
  AdminAccessBoundary: () => null,
}));
vi.mock("@/pages/Admin", () => ({
  AdminLayout: () => null,
  AdminSectionRoute: () => null,
}));

import adminRoutes from "./adminRoutes";

describe("adminRoutes 가드 대기", () => {
  test("가드가 끝나지 않는 동안 셸 스켈레톤을 보인다", async () => {
    const router = createMemoryRouter(adminRoutes, {
      initialEntries: ["/admin/popups"],
    });
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole("status", { name: "관리자 페이지 불러오는 중" }),
    ).toBeTruthy();
    expect(screen.queryByText("관리자 페이지 불러오는 중...")).toBeNull();
  });
});
