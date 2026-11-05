// W5a 학교 고르기. 본사 관리자가 대행할 학교와 사유를 골라 8시간 대행을 시작한다.

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import ConsoleGate from "../ConsoleGate";
import { homeroomMe, proxyMe, renderRoutes, stubApi } from "../testUtils";
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
});
