// /teacher 콘솔 라우트 트리: 입구 가드, 첫 비밀번호, 셸 아래 화면, 대시보드, 학교 고르기, 준비 중 화면 연결을 검증한다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("@/components/Header", () => ({
  default: () => <div data-testid="site-header" />,
}));
vi.mock("@/pages/console/useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import { adminMe, homeroomMe, stubApi } from "@/pages/console/testUtils";
import teacherConsoleRoutes from "./teacherConsoleRoutes";

function renderAt(path: string) {
  const router = createMemoryRouter(
    [...teacherConsoleRoutes, { path: "/login", element: <p>로그인 화면</p> }],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const count = {
  "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
};

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("teacherConsoleRoutes", () => {
  it("로그인하지 않았으면 /login 으로 간다", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    stubApi({});

    const router = renderAt("/teacher/my");

    expect(await screen.findByText("로그인 화면")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("임시 비밀번호 교사는 /teacher 로 들어와도 첫 비밀번호 화면을 본다", async () => {
    stubApi({
      "GET /api/console/me": {
        body: { ...homeroomMe, mustChangePassword: true },
      },
    });

    renderAt("/teacher");

    expect(
      await screen.findByRole("heading", { name: "새 비밀번호 설정" }),
    ).toBeTruthy();
    expect(screen.getByTestId("site-header")).toBeTruthy();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("/teacher/my 는 셸 안의 마이페이지를 보여 준다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...count });

    renderAt("/teacher/my");

    expect(
      await screen.findByRole("heading", { level: 1, name: "마이페이지" }),
    ).toBeTruthy();
    expect(screen.getByRole("complementary")).toBeTruthy();
  });

  it("학교 관리자는 /teacher/org-info 에서 내정보관리를 본다", async () => {
    stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/org-info": {
        body: { code: "SM26HB83", name: "한빛고등학교", infoConfirmedAt: null },
      },
      ...count,
    });

    renderAt("/teacher/org-info");

    expect(
      await screen.findByRole("heading", { level: 1, name: "내정보관리" }),
    ).toBeTruthy();
  });

  it("아직 없는 콘솔 화면은 준비 중 화면으로 연결한다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...count });

    renderAt("/teacher/coaching");

    expect(await screen.findByText("이 화면은 곧 열려요")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "개인종합코칭" }),
    ).toBeTruthy();
  });

  it("/teacher 는 셸 안의 대시보드 집계를 보여 준다", async () => {
    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/classes": { body: { classes: [] } },
      "GET /api/console/dashboard?grade=%EA%B3%A02&classId=c3": {
        body: {
          asOf: "2026-11-02",
          usage: { usingCount: 24, totalCount: 28 },
          goal: {
            userCount: 0,
            average: null,
            buckets: { low: 0, mid: 0, high: 0 },
          },
          services: [],
        },
      },
      ...count,
    });

    renderAt("/teacher");

    expect(await screen.findByText("86%")).toBeTruthy();
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect(screen.queryByText("이 화면은 곧 열려요")).toBeNull();
  });

  it("대행 권한이 있는 본사 관리자는 /teacher 에서 사이드바 없는 학교 고르기를 본다", async () => {
    stubApi({
      "GET /api/console/me": {
        status: 403,
        body: { error: { code: "NOT_CONSOLE", message: "no" } },
      },
      "GET /api/console/proxy/tenants": {
        body: {
          tenants: [{ id: "t1", code: "SM26HB83", name: "한빛고등학교" }],
        },
      },
    });

    const router = renderAt("/teacher");

    expect(await screen.findByText("대행할 학교 고르기")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/teacher/proxy");
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
