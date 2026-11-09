// W16 교사 계정 관리. 계정 목록, 활성과 비활성 전환, 본인 비활성화 막음, 담당 변경, 신규 발급, 임시 비밀번호 재발급을 검증한다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  download: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("../useIdleLogout", () => ({ useIdleLogout: vi.fn() }));
vi.mock("./issuedFile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./issuedFile")>()),
  downloadIssuedFile: mocks.download,
}));

import ConsoleGate from "../ConsoleGate";
import ConsoleLayout from "../ConsoleLayout";
import { type ApiHandler, adminMe, renderRoutes, stubApi } from "../testUtils";
import TeacherAccountsPage from "./TeacherAccountsPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "teachers/accounts", Component: TeacherAccountsPage },
        ],
      },
    ],
  },
];

const klass = (id: string, name: string, isPrimary: boolean) => ({
  id,
  grade: "고2",
  groupId: null,
  groupName: null,
  name,
  isPrimary,
  activeStudents: 30,
});

const ITEMS = [
  {
    id: "t-choi",
    name: "최민정",
    role: "school_admin",
    phoneLast4: "5678",
    loginId: "SM26HB83R4TXW9",
    status: "active",
    passwordSet: true,
    classes: [],
  },
  {
    id: "t-park",
    name: "박지훈",
    role: "homeroom",
    phoneLast4: "5678",
    lastLoginAt: "2026-11-03T08:15:00",
    loginId: "SM26HB83K7MPQ2",
    status: "active",
    passwordSet: true,
    classes: [klass("c3", "3", true), klass("c5", "5", false)],
  },
  {
    id: "t-yuna",
    name: "최유나",
    role: "homeroom",
    phoneLast4: "2468",
    loginId: "SM26HB83Y6GH2E",
    status: "inactive",
    passwordSet: false,
    classes: [klass("c4", "4", true)],
  },
];

const LIST_URL = "GET /api/console/teachers/accounts?page=1";

function body(items: unknown[] = ITEMS) {
  return { total: items.length, page: 1, pageCount: 1, items };
}

function stubPage(routesOver: Record<string, ApiHandler> = {}) {
  return stubApi({
    "GET /api/console/me": { body: adminMe },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/groups": { body: { groups: [] } },
    [LIST_URL]: { body: body() },
    ...routesOver,
  });
}

function useMobileScreen() {
  window.innerWidth = 500;
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});

afterEach(() => {
  window.innerWidth = 1024;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("W16 목록", () => {
  it("관리자 먼저 이름, 구분, 담당, 아이디, 가린 비밀번호, 상태를 한 줄에 보인다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/teachers/accounts");

    expect(await screen.findByText("교사 계정 3개")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "교사 계정 관리" }),
    ).toBeTruthy();
    for (const head of [
      "이름",
      "구분",
      "담당",
      "아이디",
      "비밀번호",
      "상태",
      "관리",
    ]) {
      expect(screen.getByRole("columnheader", { name: head })).toBeTruthy();
    }
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0] as HTMLElement).getByText("최민정")).toBeTruthy();
    expect(
      within(rows[0] as HTMLElement).getByText("학교 전체 관리자"),
    ).toBeTruthy();
    const park = rows[1] as HTMLElement;
    expect(within(park).getByText("담임교사")).toBeTruthy();
    expect(within(park).getByText("2학년 3반(주) + 2학년 5반")).toBeTruthy();
    expect(within(park).getByText("SM26HB83K7MPQ2")).toBeTruthy();
    expect(within(park).getByText("••••••")).toBeTruthy();
    expect(within(park).getByText("활성")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText("비활성")).toBeTruthy();
    expect(screen.queryByText("Ab3!xYz9Qk")).toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "최근 로그인" }),
    ).toBeTruthy();
    expect(within(park).getByText("11/03 08:15")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("-")).toBeTruthy();
  });
});

describe("W16 상태 전환", () => {
  it("목록을 읽지 못하면 다시 시도 안내를 보인다", async () => {
    stubPage({ [LIST_URL]: { status: 500, body: {} } });

    renderRoutes(routes, "/teacher/teachers/accounts");

    expect(
      await screen.findByText(
        "교사 계정 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });

  it("활성 계정은 비활성화하고 비활성 계정은 활성화하는 요청을 보낸다", async () => {
    const calls = stubPage({
      "POST /api/console/teachers/status": { body: { ok: true } },
    });

    renderRoutes(routes, "/teacher/teachers/accounts");
    const rows = (await screen.findAllByRole("row")).slice(1);
    fireEvent.click(
      within(rows[1] as HTMLElement).getByRole("button", { name: "비활성화" }),
    );
    await waitFor(() =>
      expect(calls.filter((c) => c.key.startsWith("POST"))).toHaveLength(1),
    );
    fireEvent.click(
      within(rows[2] as HTMLElement).getByRole("button", { name: "활성화" }),
    );

    await waitFor(() =>
      expect(
        calls.filter((c) => c.key.startsWith("POST")).map((c) => c.body),
      ).toEqual([
        { teacherId: "t-park", status: "inactive" },
        { teacherId: "t-yuna", status: "active" },
      ]),
    );
  });

  it("본인 계정을 비활성화하려 하면 막았다는 안내를 표 위에 보인다", async () => {
    stubPage({
      "POST /api/console/teachers/status": {
        status: 409,
        body: {
          error: {
            code: "SELF_CHANGE",
            message: "본인 계정의 상태는 바꿀 수 없습니다.",
          },
        },
      },
    });

    renderRoutes(routes, "/teacher/teachers/accounts");
    const rows = (await screen.findAllByRole("row")).slice(1);
    fireEvent.click(
      within(rows[0] as HTMLElement).getByRole("button", { name: "비활성화" }),
    );

    expect(
      await screen.findByText("본인 계정은 비활성화할 수 없어요"),
    ).toBeTruthy();
  });
});

describe("W16 담당 변경, 신규 발급, 재발급", () => {
  it("담당 변경/추가는 그 선생님의 담당 창을 열고 학급이 없는 관리자에게는 버튼이 없다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/teachers/accounts");
    const rows = (await screen.findAllByRole("row")).slice(1);
    expect(
      within(rows[0] as HTMLElement).queryByRole("button", {
        name: "담당 변경/추가",
      }),
    ).toBeNull();
    fireEvent.click(
      within(rows[1] as HTMLElement).getByRole("button", {
        name: "담당 변경/추가",
      }),
    );

    expect(
      await screen.findByText("박지훈 선생님 (공통 아이디 SM26HB83K7MPQ2)"),
    ).toBeTruthy();
  });

  it("신규 계정 발급은 발급 창을 연다", async () => {
    stubPage({
      "GET /api/console/teachers/unissued": { body: { items: [] } },
    });

    renderRoutes(routes, "/teacher/teachers/accounts");
    fireEvent.click(
      await screen.findByRole("button", { name: "신규 계정 발급" }),
    );

    expect(
      await screen.findByRole("heading", { name: "신규 계정 발급" }),
    ).toBeTruthy();
  });

  it("비밀번호를 아직 정하지 않은 계정만 재발급 버튼이 있고 누르면 안내 파일을 한 번 내려받는다", async () => {
    const calls = stubPage({
      "POST /api/console/teachers/reissue": {
        body: { ok: true, tempPassword: "Ab3!xYz9Qk" },
      },
    });

    renderRoutes(routes, "/teacher/teachers/accounts");
    const rows = (await screen.findAllByRole("row")).slice(1);
    expect(
      within(rows[1] as HTMLElement).queryByRole("button", {
        name: "임시 비밀번호 재발급",
      }),
    ).toBeNull();
    fireEvent.click(
      within(rows[2] as HTMLElement).getByRole("button", {
        name: "임시 비밀번호 재발급",
      }),
    );

    expect(
      await screen.findByText("임시 비밀번호를 다시 발급했어요"),
    ).toBeTruthy();
    expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({
      teacherId: "t-yuna",
    });
    expect(screen.queryByText("Ab3!xYz9Qk")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "안내 파일 내려받기" }));
    await waitFor(() =>
      expect(mocks.download).toHaveBeenCalledWith([
        {
          name: "최유나",
          phoneLast4: "2468",
          grade: "2학년",
          className: "4반",
          loginId: "SM26HB83Y6GH2E",
          tempPassword: "Ab3!xYz9Qk",
        },
      ]),
    );
  });
});

describe("W16 휴대폰", () => {
  it("카드로 보이고 상태 변경과 담당 변경/추가만 두며 신규 발급과 재발급은 감춘다", async () => {
    useMobileScreen();
    stubPage();

    renderRoutes(routes, "/teacher/teachers/accounts");

    expect(await screen.findByText("교사 계정 3개")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "비활성화" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "담당 변경/추가" }),
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "신규 계정 발급" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "임시 비밀번호 재발급" }),
    ).toBeNull();
    expect(
      screen.getByText("신규 계정 발급은 PC나 태블릿에서 할 수 있어요"),
    ).toBeTruthy();
  });
});
