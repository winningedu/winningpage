// 콘솔 왼쪽 위 학교 바꾸기. 본사 대행에게만 드롭다운이 보이고, 바꿀 때마다 사유를 받아
// 대행을 끝내고 다시 시작하며, 이전 학교의 데이터가 남지 않는지 검증한다.

import { useQuery } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("./useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import { consoleRequest } from "./api";
import ConsoleGate from "./ConsoleGate";
import ConsoleLayout from "./ConsoleLayout";
import ProxySelectPage from "./proxy-select/ProxySelectPage";
import { adminMe, proxyMe, renderRoutes, stubApi } from "./testUtils";

const TENANTS = [
  { id: "t1", code: "SM26HB83", name: "한빛고등학교" },
  { id: "t2", code: "SM26HM41", name: "한빛수학학원" },
];

function SchoolPage() {
  const [draft, setDraft] = useState("");
  const data = useQuery({
    queryKey: ["console", "list", "school"],
    queryFn: async () =>
      (await consoleRequest("/api/console/school")).body as { name: string },
  });
  return (
    <>
      <p>{`학교 데이터: ${data.data?.name ?? "없음"}`}</p>
      <input
        aria-label="메모"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </>
  );
}

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      { path: "proxy", Component: ProxySelectPage },
      {
        Component: ConsoleLayout,
        children: [
          { index: true, element: <p>대시보드 화면</p> },
          { path: "students", Component: SchoolPage },
          { path: "students/:id", element: <p>학생 상세</p> },
        ],
      },
    ],
  },
];

interface Setup {
  startStatus?: number;
  endStatus?: number;
}

function stubProxy(over: Setup = {}) {
  let sessionTenant: string | null = "t1";
  const tenantOf = (id: string | null) => TENANTS.find((t) => t.id === id);
  return stubApi({
    "GET /api/console/me": () => {
      const tenant = tenantOf(sessionTenant);
      if (!tenant)
        return {
          status: 403,
          body: { error: { code: "NOT_CONSOLE", message: "no" } },
        };
      return {
        body: {
          ...proxyMe,
          tenant,
          proxySession: { ...proxyMe.proxySession, tenantName: tenant.name },
        },
      };
    },
    "GET /api/console/proxy/tenants": { body: { tenants: TENANTS } },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/school": () => ({
      body: { name: tenantOf(sessionTenant)?.name },
    }),
    "POST /api/console/proxy/end": () => {
      if (over.endStatus) return { status: over.endStatus };
      sessionTenant = null;
      return { body: { ok: true, ended: true } };
    },
    "POST /api/console/proxy/start": (init) => {
      if (over.startStatus) return { status: over.startStatus };
      sessionTenant = (JSON.parse(String(init.body)) as { tenantId: string })
        .tenantId;
      return { body: { ok: true, sessionId: "ps2" } };
    },
  });
}

const picker = () =>
  screen.findByRole("combobox", {
    name: "학교 바꾸기",
  }) as Promise<HTMLSelectElement>;

async function chooseSecondTenant() {
  fireEvent.change(await picker(), { target: { value: "t2" } });
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("TenantSwitcher 보이는 사람", () => {
  it("본사 대행에게는 대행 가능한 학교 목록이 든 드롭다운으로 보인다", async () => {
    stubProxy();

    renderRoutes(routes, "/teacher");

    const select = await picker();
    expect(select.value).toBe("t1");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "한빛고등학교",
      "한빛수학학원",
    ]);
  });

  it("학교 관리자에게는 학교 이름만 보이고 대행 목록을 부르지도 않는다", async () => {
    const calls = stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    });

    renderRoutes(routes, "/teacher");

    expect((await screen.findAllByText("한빛고등학교")).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(calls.some((c) => c.key.includes("proxy/tenants"))).toBe(false);
  });
});

describe("TenantSwitcher 바꾸기", () => {
  it("다른 학교를 고르면 사유를 묻고, 취소하면 아무것도 바꾸지 않는다", async () => {
    const calls = stubProxy();
    renderRoutes(routes, "/teacher/students");
    await chooseSecondTenant();

    expect(
      await screen.findByRole("radio", { name: "명단 대행" }),
    ).toBeTruthy();
    const confirm = screen.getByRole("button", {
      name: "바꾸기",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() => expect(screen.queryByRole("radio")).toBeNull());
    expect((await picker()).value).toBe("t1");
    expect(calls.some((c) => c.key.includes("proxy/end"))).toBe(false);
    expect(calls.some((c) => c.key.includes("proxy/start"))).toBe(false);
  });

  it("사유를 고르면 대행을 끝내고 새 학교로 다시 시작해 같은 화면에서 새 학교 데이터만 보인다", async () => {
    const calls = stubProxy();
    renderRoutes(routes, "/teacher/students");
    expect(await screen.findByText("학교 데이터: 한빛고등학교")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("메모"), {
      target: { value: "A 학교 메모" },
    });
    await chooseSecondTenant();

    fireEvent.click(await screen.findByRole("radio", { name: "명단 대행" }));
    fireEvent.click(screen.getByRole("button", { name: "바꾸기" }));

    expect(await screen.findByText("학교 데이터: 한빛수학학원")).toBeTruthy();
    expect(screen.queryByText("학교 데이터: 한빛고등학교")).toBeNull();
    expect((screen.getByLabelText("메모") as HTMLInputElement).value).toBe("");
    expect((await picker()).value).toBe("t2");
    const writes = calls.filter((c) => c.key.startsWith("POST"));
    expect(writes.map((c) => c.key)).toEqual([
      "POST /api/console/proxy/end",
      "POST /api/console/proxy/start",
    ]);
    expect(writes[1]?.body).toEqual({ tenantId: "t2", reason: "roster_proxy" });
  });

  it("학생 상세처럼 다른 학교에서 열 수 없는 주소에 있었으면 콘솔 홈으로 간다", async () => {
    stubProxy();
    renderRoutes(routes, "/teacher/students/s-1");
    expect(await screen.findByText("학생 상세")).toBeTruthy();
    await chooseSecondTenant();

    fireEvent.click(await screen.findByRole("radio", { name: "장애 지원" }));
    fireEvent.click(screen.getByRole("button", { name: "바꾸기" }));

    expect(await screen.findByText("대시보드 화면")).toBeTruthy();
    expect(screen.queryByText("학생 상세")).toBeNull();
  });

  it("새 대행을 시작하지 못하면 학교 고르기 화면에서 오류를 보이고 이전 학교 화면을 남기지 않는다", async () => {
    stubProxy({ startStatus: 500 });
    renderRoutes(routes, "/teacher/students");
    await screen.findByText("학교 데이터: 한빛고등학교");
    await chooseSecondTenant();

    fireEvent.click(await screen.findByRole("radio", { name: "명단 대행" }));
    fireEvent.click(screen.getByRole("button", { name: "바꾸기" }));

    expect(await screen.findByText("대행할 학교 고르기")).toBeTruthy();
    expect(
      screen.getByText(
        "학교를 바꾸지 못했어요. 대행이 끝났으니 학교를 다시 골라 주세요",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/학교 데이터/)).toBeNull();
  });

  it("기존 대행을 끝내지 못하면 오류 토스트를 보이고 새 대행은 시작하지 않는다", async () => {
    const calls = stubProxy({ endStatus: 500 });
    renderRoutes(routes, "/teacher/students");
    await screen.findByText("학교 데이터: 한빛고등학교");
    await chooseSecondTenant();

    fireEvent.click(await screen.findByRole("radio", { name: "명단 대행" }));
    fireEvent.click(screen.getByRole("button", { name: "바꾸기" }));

    expect(
      await screen.findByText("바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요"),
    ).toBeTruthy();
    expect(screen.getByText("학교 데이터: 한빛고등학교")).toBeTruthy();
    expect(calls.some((c) => c.key.includes("proxy/start"))).toBe(false);
  });
});
