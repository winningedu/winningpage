// 콘솔 셸: 역할별 사이드바, 빵부스러기, 대행 띠, 서랍, 토스트, 유휴 로그아웃, 준비 중 화면.

import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  idle: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("./useIdleLogout", () => ({ useIdleLogout: mocks.idle }));

import ConsoleGate from "./ConsoleGate";
import ConsoleLayout from "./ConsoleLayout";
import ConsolePlaceholder from "./ConsolePlaceholder";
import PageHeader from "./PageHeader";
import { useToast } from "./Toast";
import {
  adminMe,
  homeroomMe,
  proxyMe,
  renderRoutes,
  stubApi,
} from "./testUtils";

function SamplePage() {
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="샘플 화면"
        subtitle="샘플 부제"
        notice="PC나 태블릿에서 할 수 있어요"
        actions={<button type="button">샘플 동작</button>}
      />
      <button
        type="button"
        onClick={() => toast.show({ tone: "Success", message: "저장했어요" })}
      >
        토스트 열기
      </button>
    </>
  );
}

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "my", Component: SamplePage },
          { path: "*", Component: ConsolePlaceholder },
          { index: true, Component: ConsolePlaceholder },
        ],
      },
    ],
  },
  { path: "/login", element: <p>로그인 화면</p> },
];

const countOk = {
  "GET /api/console/enrollment-requests/count": { body: { count: 4 } },
};

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ConsoleLayout 본문", () => {
  it("담임은 사이드바 메뉴, 빵부스러기(기관, 학년, 반), 화면 제목을 본다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...countOk });

    renderRoutes(routes, "/teacher/my");

    const crumbs = await screen.findByRole("navigation", { name: "현재 위치" });
    expect(
      within(crumbs)
        .getAllByText(/./)
        .map((n) => n.textContent),
    ).toEqual(["한빛고등학교", "2학년", "3반"]);
    expect(
      screen.getByRole("heading", { level: 1, name: "샘플 화면" }),
    ).toBeTruthy();
    expect(screen.getByText("샘플 부제")).toBeTruthy();
    const aside = screen.getByRole("complementary");
    expect(
      within(aside).getByRole("link", { name: "마이페이지" }),
    ).toBeTruthy();
    expect(within(aside).queryByText("교육기관관리")).toBeNull();
  });

  it("학교 전체 관리자의 빵부스러기는 기관과 전체다", async () => {
    stubApi({ "GET /api/console/me": { body: adminMe }, ...countOk });

    renderRoutes(routes, "/teacher/my");

    const crumbs = await screen.findByRole("navigation", { name: "현재 위치" });
    expect(
      within(crumbs)
        .getAllByText(/./)
        .map((n) => n.textContent),
    ).toEqual(["한빛고등학교", "전체"]);
  });

  it("승인 대기 건수를 읽어 배지로 보여 주고, 읽지 못하면 배지를 그리지 않는다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...countOk });
    const first = renderRoutes(routes, "/teacher/my");
    const aside = await screen.findByRole("complementary");
    expect(
      await within(aside).findByRole("link", { name: /학생조회-변경-이력.*4/ }),
    ).toBeTruthy();
    first.unmount();

    stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/enrollment-requests/count": { status: 500 },
    });
    renderRoutes(routes, "/teacher/my");
    const link = await screen.findByRole("link", {
      name: "학생조회-변경-이력",
    });
    expect(link.textContent).toBe("학생조회-변경-이력");
  });

  it("휴대폰 안내 문구는 768 미만에서만, 동작 버튼은 768 이상에서만 보인다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...countOk });

    renderRoutes(routes, "/teacher/my");

    const notice = await screen.findByText("PC나 태블릿에서 할 수 있어요");
    expect(notice.className).toContain("md:hidden");
    expect(
      screen.getByRole("button", { name: "샘플 동작" }).parentElement
        ?.className,
    ).toContain("max-md:hidden");
  });

  it("유휴 로그아웃 훅을 셸에서 한 번 건다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...countOk });

    renderRoutes(routes, "/teacher/my");
    await screen.findByRole("heading", { level: 1, name: "샘플 화면" });

    expect(mocks.idle).toHaveBeenCalled();
  });
});

describe("ConsoleLayout 서랍", () => {
  it("메뉴 줄에 현재 화면 이름을 보여 주고, 메뉴를 누르면 서랍이 열리고 항목을 누르면 닫힌다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...countOk });

    renderRoutes(routes, "/teacher/my");

    const menuButton = await screen.findByRole("button", { name: /메뉴/ });
    const bar = menuButton.parentElement as HTMLElement;
    expect(within(bar).getByText("마이페이지")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(menuButton);
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByRole("link", { name: "학생 관리" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("닫기 버튼으로 서랍을 닫는다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...countOk });
    renderRoutes(routes, "/teacher/my");

    fireEvent.click(await screen.findByRole("button", { name: /메뉴/ }));
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByRole("button", { name: "닫기" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("ConsoleLayout 본사 대행 띠", () => {
  it("대행 중이면 기관명 띠를 보이고 종료를 누르면 대행 종료 후 학교 고르기로 보낸다", async () => {
    const calls = stubApi({
      "GET /api/console/me": { body: proxyMe },
      "POST /api/console/proxy/end": { body: { ok: true, ended: true } },
      ...countOk,
    });

    const { router } = renderRoutes(routes, "/teacher/my");

    expect(await screen.findByText("본사 대행 중: 한빛고등학교")).toBeTruthy();
    expect(
      screen.getByText("모든 조회와 수정은 본사 직원 이름으로 기록돼요."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "종료" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/teacher/proxy"),
    );
    expect(calls.map((c) => c.key)).toContain("POST /api/console/proxy/end");
  });

  it("대행 중이 아니면 띠가 없다", async () => {
    stubApi({ "GET /api/console/me": { body: adminMe }, ...countOk });

    renderRoutes(routes, "/teacher/my");
    await screen.findByRole("heading", { level: 1, name: "샘플 화면" });

    expect(screen.queryByText(/본사 대행 중/)).toBeNull();
  });

  it("대행 만료 시각이 지나면 학교 고르기로 보낸다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-11-05T00:00:00Z"));
    stubApi({
      "GET /api/console/me": {
        body: {
          ...proxyMe,
          proxySession: {
            ...proxyMe.proxySession,
            expiresAt: "2026-11-05T08:00:00Z",
          },
        },
      },
      ...countOk,
    });

    const { router } = renderRoutes(routes, "/teacher/students");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(router.state.location.pathname).toBe("/teacher/students");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000);
    });

    expect(router.state.location.pathname).toBe("/teacher/proxy");
  });
});

describe("ConsoleLayout 토스트와 준비 중 화면", () => {
  it("토스트를 3초 보여 주고 사라진다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...countOk });
    renderRoutes(routes, "/teacher/my");
    const open = await screen.findByRole("button", { name: "토스트 열기" });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(open);
    expect(screen.getByRole("status").textContent).toBe("저장했어요");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("아직 없는 화면은 가짜 데이터 없이 준비 중이라고 알린다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...countOk });

    renderRoutes(routes, "/teacher/students");

    expect(
      await screen.findByRole("heading", { level: 1, name: "학생 관리" }),
    ).toBeTruthy();
    expect(screen.getByText("이 화면은 곧 열려요")).toBeTruthy();
  });

  it("담임이 관리자 전용 화면 주소로 들어오면 대시보드로 돌려보낸다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe }, ...countOk });

    const { router } = renderRoutes(routes, "/teacher/accounts");

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/teacher"),
    );
  });

  it("본사 대행은 마이페이지 주소로 들어오면 대시보드로 돌려보낸다(결정 48)", async () => {
    stubApi({ "GET /api/console/me": { body: proxyMe }, ...countOk });

    const { router } = renderRoutes(routes, "/teacher/my");

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/teacher"),
    );
  });
});
