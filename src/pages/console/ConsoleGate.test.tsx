// /teacher 아래 모든 화면의 입구. 로그인, 콘솔 권한, 임시 비밀번호 상태에 따라 보낸다.

import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import ConsoleGate from "./ConsoleGate";
import { homeroomMe, renderRoutes, stubApi } from "./testUtils";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      { path: "first-password", element: <p>첫 비밀번호 화면</p> },
      { path: "my", element: <p>마이페이지 화면</p> },
    ],
  },
  { path: "/login", element: <p>로그인 화면</p> },
];

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ConsoleGate", () => {
  it("로그인하지 않았으면 /login 으로 보낸다", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    stubApi({});

    const { router } = renderRoutes(routes, "/teacher/my");

    expect(await screen.findByText("로그인 화면")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe(
      `?redirect=${encodeURIComponent("/teacher/my")}`,
    );
  });

  it("콘솔 권한이 없는 계정은 접근 불가 안내를 본다", async () => {
    stubApi({
      "GET /api/console/me": {
        status: 403,
        body: { error: { code: "NOT_CONSOLE", message: "no" } },
      },
    });

    renderRoutes(routes, "/teacher/my");

    expect(await screen.findByText("이용 권한이 없어요")).toBeTruthy();
    expect(screen.queryByText("마이페이지 화면")).toBeNull();
  });

  it("임시 비밀번호 상태면 어느 콘솔 화면이든 첫 비밀번호 화면으로 보낸다", async () => {
    stubApi({
      "GET /api/console/me": {
        body: { ...homeroomMe, mustChangePassword: true },
      },
    });

    const { router } = renderRoutes(routes, "/teacher/my");

    expect(await screen.findByText("첫 비밀번호 화면")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/teacher/first-password");
  });

  it("임시 비밀번호 상태가 아니면 첫 비밀번호 화면을 직접 열어도 /teacher 로 보낸다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe } });

    const { router } = renderRoutes(routes, "/teacher/first-password");

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/teacher"),
    );
  });

  it("정상 계정은 요청한 화면을 본다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe } });

    renderRoutes(routes, "/teacher/my");

    expect(await screen.findByText("마이페이지 화면")).toBeTruthy();
  });

  it("me 조회가 실패하면 다시 시도 버튼을 보여 준다", async () => {
    stubApi({ "GET /api/console/me": { status: 500 } });

    renderRoutes(routes, "/teacher/my");

    expect(
      await screen.findByRole("button", { name: "다시 시도" }),
    ).toBeTruthy();
  });
});
