// W14 교사 정보 입력관리. 목록, 빈 상태, 필터, 휴대폰, 연결 미리보기와 W14a~W14e 창을 검증한다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("../useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import ConsoleGate from "../ConsoleGate";
import ConsoleLayout from "../ConsoleLayout";
import { type ApiHandler, adminMe, renderRoutes, stubApi } from "../testUtils";
import TeacherRosterPage from "./TeacherRosterPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "teachers", Component: TeacherRosterPage },
          { path: "teachers/excel", Component: () => <p>엑셀 화면</p> },
          { path: "students", Component: () => <p>학생 화면</p> },
        ],
      },
    ],
  },
];

const row = (over: Record<string, unknown> = {}) => ({
  classId: "c-2-3",
  grade: "고2",
  groupName: null,
  className: "3",
  activeStudents: 28,
  teacher: { id: "t-park", name: "박지훈" },
  loginId: "SM26HB83K7MPQ2",
  accountStatus: "active",
  classCount: 2,
  ...over,
});

const ROWS = [
  row(),
  row({
    classId: "c-2-5",
    className: "5",
    activeStudents: 30,
  }),
  row({
    classId: "c-1-2",
    grade: "고1",
    className: "2",
    activeStudents: 29,
    teacher: { id: "t-lee", name: "이수민" },
    loginId: "SM26HB83W5ZQ7H",
    accountStatus: "unissued",
    classCount: 1,
  }),
  row({
    classId: "c-3-2",
    grade: "고3",
    className: "2",
    activeStudents: 29,
    teacher: null,
    loginId: null,
    accountStatus: null,
    classCount: 0,
  }),
  row({
    classId: "c-2-4",
    className: "4",
    activeStudents: 30,
    teacher: { id: "t-choi", name: "최유나" },
    loginId: "SM26HB83Y6GH2E",
    accountStatus: "inactive",
    classCount: 1,
  }),
];

const TEACHERS = [
  {
    id: "t-park",
    name: "박지훈",
    role: "homeroom",
    status: "active",
    hasAccount: true,
    activeStudents: 58,
    classes: [
      { grade: "고2", groupId: null, groupName: null, name: "3" },
      { grade: "고2", groupId: null, groupName: null, name: "5" },
    ],
  },
];

const LIST_URL = "GET /api/console/teachers/list?page=1";

function listBody(items: unknown[], total = items.length) {
  return {
    total,
    page: 1,
    pageCount: Math.max(1, Math.ceil(total / 50)),
    items,
    teachers: TEACHERS,
  };
}

function stubPage(
  routesOver: Record<string, ApiHandler> = {},
  me: unknown = adminMe,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/classes": { body: { classes: [] } },
    [LIST_URL]: { body: listBody(ROWS) },
    ...routesOver,
  });
}

function useMobileScreen() {
  // useIsMobile 은 innerWidth 로 가른다(768 미만)
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

describe("W14 목록", () => {
  it("담당 학급마다 한 줄로 학년그룹, 반, 이름, 재학생 수, 로그인 계정을 보인다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/teachers");

    expect(await screen.findByText("총 5개 학급")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "교사 정보 입력관리" }),
    ).toBeTruthy();
    for (const head of [
      "학년그룹",
      "반",
      "이름",
      "재학생 수",
      "로그인 계정",
      "수정/삭제",
    ]) {
      expect(screen.getByRole("columnheader", { name: head })).toBeTruthy();
    }
    const park = screen.getAllByText("박지훈")[0]?.closest("tr") as HTMLElement;
    expect(within(park).getByText("2학년")).toBeTruthy();
    expect(within(park).getByText("3반")).toBeTruthy();
    expect(within(park).getByText("28")).toBeTruthy();
    expect(within(park).getByText("SM26HB83K7MPQ2")).toBeTruthy();
    expect(within(park).getByText("활성")).toBeTruthy();
    expect(within(park).getByText("공통, 2개 반")).toBeTruthy();

    const lee = screen.getByText("이수민").closest("tr") as HTMLElement;
    expect(within(lee).getByText("미발급")).toBeTruthy();
    expect(within(lee).getByRole("button", { name: "발급" })).toBeTruthy();
    expect(within(lee).queryByText(/공통/)).toBeNull();

    const none = screen.getByText("(미등록)").closest("tr") as HTMLElement;
    expect(within(none).getByText("3학년")).toBeTruthy();
    expect(within(none).getByText("-")).toBeTruthy();

    const choi = screen.getByText("최유나").closest("tr") as HTMLElement;
    expect(within(choi).getByText("비활성")).toBeTruthy();
    expect(screen.getByText("1 / 1 페이지, 1~5번째")).toBeTruthy();
  });
});

describe("W14 빈 상태와 필터", () => {
  it("목록을 읽지 못하면 다시 시도 안내를 보인다", async () => {
    stubPage({ [LIST_URL]: { status: 500, body: {} } });

    renderRoutes(routes, "/teacher/teachers");

    expect(
      await screen.findByText(
        "교사 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });

  it("등록된 선생님이 없으면 안내 문구만 보인다", async () => {
    stubPage({ [LIST_URL]: { body: listBody([], 0) } });

    renderRoutes(routes, "/teacher/teachers");

    expect(await screen.findByText("총 0개 학급")).toBeTruthy();
    expect(screen.getByText("등록된 선생님이 없어요")).toBeTruthy();
  });

  it("학년그룹을 고르면 그 학년으로 다시 읽는다", async () => {
    const calls = stubPage({
      "GET /api/console/classes": {
        body: {
          classes: [
            {
              id: "c1",
              grade: "고1",
              groupId: null,
              groupName: null,
              name: "2",
              hasHomeroom: true,
            },
            {
              id: "c2",
              grade: "고2",
              groupId: null,
              groupName: null,
              name: "3",
              hasHomeroom: true,
            },
          ],
        },
      },
      "GET /api/console/teachers/list?grade=%EA%B3%A02&page=1": {
        body: listBody([ROWS[0]]),
      },
    });

    renderRoutes(routes, "/teacher/teachers");
    await screen.findByText("총 5개 학급");
    fireEvent.change(await screen.findByLabelText("학년그룹"), {
      target: { value: "고2" },
    });

    expect(await screen.findByText("총 1개 학급")).toBeTruthy();
    expect(
      calls.some(
        (c) =>
          c.key === "GET /api/console/teachers/list?grade=%EA%B3%A02&page=1",
      ),
    ).toBe(true);
  });
});

describe("W14 휴대폰", () => {
  it("계정 생성, 선생님 삭제, 삭제, 발급 버튼을 감추고 미리보기와 수정만 둔다", async () => {
    useMobileScreen();
    stubPage();

    renderRoutes(routes, "/teacher/teachers");

    expect(await screen.findByText("총 5개 학급")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "학생 가입 연결 미리보기" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "수정" }).length,
    ).toBeGreaterThan(0);
    for (const name of ["계정 생성하기", "선생님 삭제하기", "삭제", "발급"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(
      screen.getByText(
        "교사 등록, 삭제, 계정 발급은 PC나 태블릿에서 할 수 있어요",
      ),
    ).toBeTruthy();
  });
});

describe("W14 등록과 창", () => {
  it("계정 생성하기에서 일괄 등록을 고르면 엑셀 화면으로 가고 개별 등록을 고르면 등록 창이 열린다", async () => {
    stubPage({ "GET /api/console/groups": { body: { groups: [] } } });

    const { router } = renderRoutes(routes, "/teacher/teachers");
    fireEvent.click(
      await screen.findByRole("button", { name: "계정 생성하기" }),
    );
    expect(screen.getByText("등록 방식 고르기")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "개별 등록" }));
    expect(
      await screen.findByRole("heading", { name: "개별 등록" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    fireEvent.click(screen.getByRole("button", { name: "계정 생성하기" }));
    fireEvent.click(screen.getByRole("button", { name: "일괄 등록" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/teacher/teachers/excel"),
    );
  });

  it("미발급 줄의 발급 버튼은 그 선생님을 고른 발급 창을 연다", async () => {
    stubPage({
      "GET /api/console/teachers/unissued": {
        body: {
          items: [
            { id: "t-lee", name: "이수민", phoneLast4: "1234", classes: [] },
          ],
        },
      },
    });

    renderRoutes(routes, "/teacher/teachers");
    const lee = (await screen.findByText("이수민")).closest(
      "tr",
    ) as HTMLElement;
    fireEvent.click(within(lee).getByRole("button", { name: "발급" }));

    expect(await screen.findByText("신규 계정 발급")).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByLabelText("선생님") as HTMLSelectElement).value).toBe(
        "t-lee",
      ),
    );
  });

  it("수정은 이름 창을, 삭제는 확인 창을 열고 삭제하면 목록을 다시 읽는다", async () => {
    let listCalls = 0;
    const calls = stubPage({
      [LIST_URL]: () => {
        listCalls += 1;
        return { body: listBody(ROWS) };
      },
      "POST /api/console/teachers/delete": {
        body: { ok: true, deleted: 1, activeStudents: 58 },
      },
    });

    renderRoutes(routes, "/teacher/teachers");
    const park = (await screen.findAllByText("박지훈"))[0]?.closest(
      "tr",
    ) as HTMLElement;
    fireEvent.click(within(park).getByRole("button", { name: "수정" }));
    expect(await screen.findByText("이름 수정")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    fireEvent.click(within(park).getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("박지훈 선생님을 삭제할까요?")).toBeTruthy();
    expect(screen.getByText(/재학생 58명/)).toBeTruthy();
    const before = listCalls;
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "삭제" }),
    );

    await waitFor(() =>
      expect(
        calls.some((c) => c.key === "POST /api/console/teachers/delete"),
      ).toBe(true),
    );
    await waitFor(() => expect(listCalls).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("선생님 삭제하기는 선택 삭제 창을 열고 연결 미리보기 버튼은 패널을 연다", async () => {
    stubPage({ "GET /api/console/groups": { body: { groups: [] } } });

    renderRoutes(routes, "/teacher/teachers");
    fireEvent.click(
      await screen.findByRole("button", { name: "선생님 삭제하기" }),
    );
    expect(await screen.findByRole("tab", { name: "일괄 삭제" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    fireEvent.click(
      screen.getByRole("button", { name: "학생 가입 연결 미리보기" }),
    );
    expect(
      await screen.findByRole("region", { name: "학생 가입 연결 미리보기" }),
    ).toBeTruthy();
  });
});
