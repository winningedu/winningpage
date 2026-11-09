// W5a 학교 고르기. 본사 관리자가 대행할 학교와 사유를 골라 8시간 대행을 시작한다.

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import ConsoleGate from "../ConsoleGate";
import { ToastProvider } from "../Toast";
import { proxyMe, renderRoutes, stubApi } from "../testUtils";
import ProxySelectPage from "./ProxySelectPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      { index: true, element: <p>대시보드 화면</p> },
      { path: "proxy", Component: ProxySelectPage },
    ],
  },
];

const TENANTS = {
  tenants: [
    { id: "t1", code: "SM26HB83", name: "한빛고등학교" },
    { id: "t2", code: "SM26HM41", name: "한빛수학학원" },
    { id: "t3", code: "SM26SS72", name: "새솔중학교" },
  ],
};

const NOT_CONSOLE = {
  status: 403,
  body: { error: { code: "NOT_CONSOLE", message: "no" } },
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

describe("ProxySelectPage", () => {
  it("본사 관리자는 학교 목록과 사유 3개를 보고, 학교와 사유를 모두 고르기 전까지 대행 시작이 막혀 있다", async () => {
    stubApi({
      "GET /api/console/me": NOT_CONSOLE,
      "GET /api/console/proxy/tenants": { body: TENANTS },
    });

    renderRoutes(routes, "/teacher/proxy");

    expect(await screen.findByText("한빛고등학교")).toBeTruthy();
    expect(screen.getByText("SM26HB83")).toBeTruthy();
    for (const reason of ["관리자 부재", "명단 대행", "장애 지원"]) {
      expect(screen.getByRole("radio", { name: reason })).toBeTruthy();
    }
    const start = screen.getByRole("button", {
      name: "대행 시작",
    }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.queryByText(/8시간 뒤 자동으로 끝나요/)).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "한빛고등학교" }));
    expect(start.disabled).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "명단 대행" }));
    expect(start.disabled).toBe(false);
    expect(screen.getByText(/8시간 뒤 자동으로 끝나요/)).toBeTruthy();
  });
  it("학교 목록을 읽지 못하면 다시 시도 안내를 보인다", async () => {
    stubApi({
      "GET /api/console/proxy/tenants": () => {
        throw new TypeError("network");
      },
    });

    renderRoutes(
      [
        {
          path: "/teacher/proxy",
          element: (
            <ToastProvider>
              <ProxySelectPage />
            </ToastProvider>
          ),
        },
      ],
      "/teacher/proxy",
    );

    expect(
      await screen.findByText(
        "학교 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });

  it("대행 권한이 있는 본사 관리자가 다른 콘솔 주소로 들어오면 학교 고르기로 보낸다", async () => {
    stubApi({
      "GET /api/console/me": NOT_CONSOLE,
      "GET /api/console/proxy/tenants": { body: TENANTS },
    });

    const { router } = renderRoutes(routes, "/teacher");

    expect(await screen.findByText("대행할 학교 고르기")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/teacher/proxy");
  });

  it("대행 권한이 없는 계정은 학교 고르기로 가지 않고 이용 권한 없음 안내를 본다", async () => {
    stubApi({
      "GET /api/console/me": NOT_CONSOLE,
      "GET /api/console/proxy/tenants": {
        status: 403,
        body: { error: { code: "FORBIDDEN", message: "no" } },
      },
    });

    renderRoutes(routes, "/teacher");

    expect(await screen.findByText("이용 권한이 없어요")).toBeTruthy();
    expect(screen.queryByText("대행할 학교 고르기")).toBeNull();
  });

  it("학교 이름이나 소속코드로 목록을 좁히고, 맞는 학교가 없으면 안내한다", async () => {
    stubApi({
      "GET /api/console/me": NOT_CONSOLE,
      "GET /api/console/proxy/tenants": { body: TENANTS },
    });

    renderRoutes(routes, "/teacher/proxy");
    await screen.findByText("한빛고등학교");

    fireEvent.change(screen.getByLabelText("학교 검색"), {
      target: { value: "sm26ss" },
    });
    expect(screen.getByText("새솔중학교")).toBeTruthy();
    expect(screen.queryByText("한빛고등학교")).toBeNull();

    fireEvent.change(screen.getByLabelText("학교 검색"), {
      target: { value: "없는학교" },
    });
    expect(
      screen.getByText("찾는 학교가 없어요. 이름이나 소속코드를 바꿔 보세요"),
    ).toBeTruthy();
  });

  it("대행을 시작하면 고른 학교와 사유를 보내고 me 를 다시 읽은 뒤 대시보드로 간다", async () => {
    let started = false;
    const calls = stubApi({
      "GET /api/console/me": () => (started ? { body: proxyMe } : NOT_CONSOLE),
      "GET /api/console/proxy/tenants": { body: TENANTS },
      "POST /api/console/proxy/start": () => {
        started = true;
        return { body: { ok: true, sessionId: "ps1" } };
      },
    });

    const { router } = renderRoutes(routes, "/teacher/proxy");
    await screen.findByText("한빛고등학교");
    fireEvent.click(screen.getByRole("radio", { name: "한빛수학학원" }));
    fireEvent.click(screen.getByRole("radio", { name: "장애 지원" }));
    fireEvent.click(screen.getByRole("button", { name: "대행 시작" }));

    expect(await screen.findByText("대시보드 화면")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/teacher");
    expect(
      calls.find((c) => c.key === "POST /api/console/proxy/start")?.body,
    ).toEqual({ tenantId: "t2", reason: "incident_support" });
  });

  it("대행을 시작하지 못하면 오류 알림을 보이고 이 화면에 머문다", async () => {
    stubApi({
      "GET /api/console/me": NOT_CONSOLE,
      "GET /api/console/proxy/tenants": { body: TENANTS },
      "POST /api/console/proxy/start": {
        status: 500,
        body: { error: { code: "INTERNAL", message: "x" } },
      },
    });

    const { router } = renderRoutes(routes, "/teacher/proxy");
    await screen.findByText("한빛고등학교");
    fireEvent.click(screen.getByRole("radio", { name: "한빛고등학교" }));
    fireEvent.click(screen.getByRole("radio", { name: "관리자 부재" }));
    fireEvent.click(screen.getByRole("button", { name: "대행 시작" }));

    expect(
      await screen.findByText(
        "대행을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe("/teacher/proxy");
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "대행 시작" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });
});
