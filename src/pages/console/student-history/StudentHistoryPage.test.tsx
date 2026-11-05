// W13 학생조회-변경-이력. 승인 대기, 학생 조회와 이력, 졸업생 탭과 W13a, W13b, W13c 창을 검증한다.

import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("../useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import ConsoleGate from "../ConsoleGate";
import ConsoleLayout from "../ConsoleLayout";
import {
  type ApiHandler,
  adminMe,
  homeroomMe,
  renderRoutes,
  stubApi,
} from "../testUtils";
import StudentHistoryPage from "./StudentHistoryPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "student-history", Component: StudentHistoryPage },
          { path: "coaching", Component: () => <p>코칭 화면</p> },
        ],
      },
    ],
  },
];

const slot = (
  className: string | null,
  number: number | null,
  grade: string | null = "고2",
  groupName: string | null = null,
) => ({ grade, groupName, className, number });

const request = (n: number, over: Record<string, unknown> = {}) => ({
  changeId: `ch${n}`,
  studentId: `s${n}`,
  studentName: n === 1 ? "김서연" : "정도윤",
  from: slot("4", 7),
  to: slot("3", 12),
  gradeChanges: false,
  createdAt: "2026-11-01T00:00:00Z",
  ...over,
});

const PENDING_URL = "GET /api/console/enrollment-requests?page=1";

function pendingBody(items: unknown[], total = items.length) {
  return { total, page: 1, pageCount: Math.ceil(total / 50), items };
}

function stubPage(
  routesOver: Record<string, ApiHandler> = {},
  me: unknown = homeroomMe,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/enrollment-requests/count": { body: { count: 2 } },
    [PENDING_URL]: { body: pendingBody([request(1), request(2)]) },
    ...routesOver,
  });
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});
function useMobileScreen() {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("W13 승인 대기 탭", () => {
  it("승인 대기 요청을 기존 자리와 요청한 자리로 보여 준다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/student-history");

    expect(await screen.findByText("승인 대기 2건")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "학생조회-변경-이력" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "승인 대기 요청을 처리하고 학생의 학년그룹과 반 이력을 확인합니다",
      ),
    ).toBeTruthy();
    for (const head of [
      "학생명",
      "기존 학년그룹/반/번호",
      "요청한 학년그룹/반/번호",
      "처리",
    ]) {
      expect(screen.getByRole("columnheader", { name: head })).toBeTruthy();
    }
    const row = screen.getByText("김서연").closest("tr") as HTMLElement;
    expect(within(row).getByText("2학년 4반 7번")).toBeTruthy();
    expect(within(row).getByText("2학년 3반 12번")).toBeTruthy();
    expect(within(row).getByText("신청 중")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "승인" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "거절" })).toBeTruthy();
    // 담임은 졸업생 탭이 없다
    expect(screen.getByRole("tab", { name: "승인 대기" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "학생 조회와 이력" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "졸업생" })).toBeNull();
  });
});

describe("W13 승인 대기 빈 상태", () => {
  it("승인 대기가 없으면 머리와 안내 문장만 보인다", async () => {
    stubPage({ [PENDING_URL]: { body: pendingBody([]) } });

    renderRoutes(routes, "/teacher/student-history");

    expect(await screen.findByText("승인 대기 0건")).toBeTruthy();
    expect(
      screen.getByText(
        "승인 대기가 없어요. 학생 조회와 이력 탭에서 학생의 학년그룹과 반 이력을 볼 수 있어요",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "학생명" })).toBeTruthy();
    expect(screen.queryByText(/\d+ \/ \d+ 페이지/)).toBeNull();
  });
});

const DECIDE = "POST /api/console/enrollment-requests/decide";
const row = (name: string) =>
  screen.getByText(name).closest("tr") as HTMLElement;
const navLink = () =>
  screen
    .getAllByRole("link")
    .find((a) => a.textContent?.startsWith("학생조회-변경-이력"));

describe("W13 승인", () => {
  it("승인하면 행이 사라지고 사이드바 배지와 알림이 바뀐다", async () => {
    let approved = false;
    const calls = stubPage({
      "GET /api/console/enrollment-requests/count": () => ({
        body: { count: approved ? 1 : 2 },
      }),
      [PENDING_URL]: () => ({
        body: pendingBody(approved ? [request(2)] : [request(1), request(2)]),
      }),
      [DECIDE]: () => {
        approved = true;
        return {
          body: { ok: true, status: "approved", studentName: "김서연", to: {} },
        };
      },
    });
    renderRoutes(routes, "/teacher/student-history");
    await screen.findByText("승인 대기 2건");
    expect(navLink()?.textContent).toBe("학생조회-변경-이력2");

    fireEvent.click(
      within(row("김서연")).getByRole("button", { name: "승인" }),
    );

    expect(
      await screen.findByText("김서연 학생의 변경을 승인했어요"),
    ).toBeTruthy();
    expect(await screen.findByText("승인 대기 1건")).toBeTruthy();
    expect(screen.queryByText("김서연", { selector: "td *, td" })).toBeNull();
    await vi.waitFor(() =>
      expect(navLink()?.textContent).toBe("학생조회-변경-이력1"),
    );
    expect(calls.find((c) => c.key === DECIDE)?.body).toEqual({
      changeId: "ch1",
      approve: true,
    });
  });
});

describe("W13 승인 오류", () => {
  it("번호가 이미 쓰이면 쓰는 학생을 안내 문구에 넣고 행은 남긴다", async () => {
    stubPage(
      {
        [PENDING_URL]: {
          body: pendingBody([request(1, { studentName: "김*연" })]),
        },
        [DECIDE]: {
          status: 409,
          body: {
            error: {
              code: "NUMBER_TAKEN",
              message: "이미 사용 중인 번호예요.",
            },
            occupant: {
              grade: "고2",
              className: "3",
              number: 7,
              displayName: "윤*린",
            },
          },
        },
      },
      adminMe,
    );
    renderRoutes(routes, "/teacher/student-history");
    await screen.findByText("승인 대기 1건");

    fireEvent.click(within(row("김*연")).getByRole("button", { name: "승인" }));

    expect(
      await screen.findByText(
        "이미 사용 중인 번호예요(2학년 3반 7번, 윤*린). 김*연 학생이 요청한 번호라 승인할 수 없어요. 거절 사유에 비어 있는 번호를 적어 다시 요청하게 해 주세요",
      ),
    ).toBeTruthy();
    expect(row("김*연")).toBeTruthy();
  });

  it("다른 분이 먼저 처리했으면 안내를 보이고 목록을 다시 불러온다", async () => {
    const calls = stubPage({
      [DECIDE]: {
        status: 409,
        body: {
          error: {
            code: "VERSION_CONFLICT",
            message: "다른 분이 먼저 바꿨어요. 새로 고침해 주세요.",
          },
        },
      },
    });
    renderRoutes(routes, "/teacher/student-history");
    await screen.findByText("승인 대기 2건");

    fireEvent.click(
      within(row("김서연")).getByRole("button", { name: "승인" }),
    );

    expect(
      await screen.findByText("다른 분이 먼저 바꿨어요. 새로 고침해 주세요"),
    ).toBeTruthy();
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.key === PENDING_URL)).toHaveLength(2),
    );
  });
});

const REASON_PLACEHOLDER = "거절 사유를 입력해요";
const openReject = async (name = "김서연") => {
  await screen.findByText("승인 대기 2건");
  fireEvent.click(within(row(name)).getByRole("button", { name: "거절" }));
  return screen.findByRole("dialog", { name: "거절 사유" });
};

describe("W13c 거절 사유", () => {
  it("사유가 비어 있으면 서버에 보내지 않고 안내와 함께 확정을 막는다", async () => {
    const calls = stubPage();
    renderRoutes(routes, "/teacher/student-history");
    const dialog = await openReject();
    expect(
      within(dialog).getByText("사유는 학생에게 알림으로 가요"),
    ).toBeTruthy();
    const box = within(dialog).getByPlaceholderText(REASON_PLACEHOLDER);
    expect(box.getAttribute("maxlength")).toBe("200");

    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "거절 확정" }));

    expect(
      within(dialog).getByText("사유를 적어야 거절할 수 있어요"),
    ).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "거절 확정",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(calls.some((c) => c.key === DECIDE)).toBe(false);

    fireEvent.change(box, { target: { value: "번호 확인" } });
    expect(
      (
        within(dialog).getByRole("button", {
          name: "거절 확정",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      within(dialog).queryByText("사유를 적어야 거절할 수 있어요"),
    ).toBeNull();
  });
});

describe("W13c 거절 확정", () => {
  const confirm = (dialog: HTMLElement, text: string) => {
    fireEvent.change(within(dialog).getByPlaceholderText(REASON_PLACEHOLDER), {
      target: { value: text },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "거절 확정" }));
  };

  it("앞뒤 공백을 뺀 사유를 보내고 창을 닫고 알림을 띄운다", async () => {
    const calls = stubPage({
      [DECIDE]: {
        body: { ok: true, status: "rejected", studentName: "김서연", to: {} },
      },
    });
    renderRoutes(routes, "/teacher/student-history");
    const dialog = await openReject();

    confirm(dialog, "  7번은 비어 있지 않아요  ");

    expect(
      await screen.findByText("김서연 학생의 변경을 거절했어요"),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.find((c) => c.key === DECIDE)?.body).toEqual({
      changeId: "ch1",
      approve: false,
      rejectReason: "7번은 비어 있지 않아요",
    });
  });

  it("이미 처리된 신청이면 창을 닫고 안내를 보인다", async () => {
    stubPage({
      [DECIDE]: {
        status: 404,
        body: { error: { code: "REQUEST_NOT_FOUND", message: "없어요" } },
      },
    });
    renderRoutes(routes, "/teacher/student-history");
    const dialog = await openReject();

    confirm(dialog, "사유");

    expect(
      await screen.findByText("다른 분이 먼저 바꿨어요. 새로 고침해 주세요"),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("서버가 사유를 비었다고 하면 확정을 막는 상태가 된다", async () => {
    stubPage({
      [DECIDE]: {
        status: 400,
        body: { error: { code: "REJECT_REASON_REQUIRED", message: "x" } },
      },
    });
    renderRoutes(routes, "/teacher/student-history");
    const dialog = await openReject();

    confirm(dialog, "사유");

    expect(
      await within(dialog).findByText("사유를 적어야 거절할 수 있어요"),
    ).toBeTruthy();
  });
});

describe("W13 승인 대기 쪽 나누기와 안내", () => {
  it("쪽 표시와 다음 쪽 이동을 쿼리스트링에 둔다", async () => {
    const PAGE2 = "GET /api/console/enrollment-requests?page=2";
    stubPage({
      [PENDING_URL]: {
        body: { total: 120, page: 1, pageCount: 3, items: [request(1)] },
      },
      [PAGE2]: {
        body: { total: 120, page: 2, pageCount: 3, items: [request(2)] },
      },
    });
    const { router } = renderRoutes(routes, "/teacher/student-history");
    expect(await screen.findByText("1 / 3 페이지, 1~50번째")).toBeTruthy();
    expect(screen.getByText("승인 대기 120건")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "이전" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(await screen.findByText("2 / 3 페이지, 51~100번째")).toBeTruthy();
    expect(screen.getByText("정도윤")).toBeTruthy();
    expect(router.state.location.search).toBe("?page=2");
  });

  it("학년이 바뀌는 신청마다 한 줄씩 안내한다", async () => {
    stubPage({
      [PENDING_URL]: {
        body: pendingBody([request(1, { gradeChanges: true }), request(2)]),
      },
    });
    renderRoutes(routes, "/teacher/student-history");

    expect(
      await screen.findByText(
        "김서연: 학년이 바뀌면 목표관리 D-day와 내신 기준이 바뀌어요",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/^정도윤: 학년이/)).toBeNull();
  });
});

describe("W13 승인 대기 휴대폰", () => {
  it("표 대신 카드로 보이고 더 보기로 다음 쪽을 이어 붙인다", async () => {
    useMobileScreen();
    const PAGE2 = "GET /api/console/enrollment-requests?page=2";
    stubPage({
      [PENDING_URL]: {
        body: { total: 2, page: 1, pageCount: 2, items: [request(1)] },
      },
      [PAGE2]: {
        body: { total: 2, page: 2, pageCount: 2, items: [request(2)] },
      },
    });
    renderRoutes(routes, "/teacher/student-history");

    expect(await screen.findByText("김서연")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("기존 학년그룹/반/번호")).toBeTruthy();
    expect(screen.getByText("2학년 3반 12번")).toBeTruthy();
    expect(screen.getByText("1 / 2건")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "쪽 이동" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));

    expect(await screen.findByText("정도윤")).toBeTruthy();
    expect(screen.getByText("김서연")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
  });
});

const student = (n: number, over: Record<string, unknown> = {}) => ({
  studentId: `s${n}`,
  name: n === 1 ? "김서연" : "정도윤",
  grade: "고2",
  groupName: null,
  history: [
    { schoolYear: 2026, grade: "고2", groupName: null, className: "3" },
    { schoolYear: 2025, grade: "고1", groupName: null, className: "5" },
  ],
  servicesUsed: 6,
  servicesTotal: 6,
  enrollment: {
    grade: "고2",
    groupId: null,
    classId: "c3",
    className: "3",
    number: n,
    version: 4,
  },
  ...over,
});

const klass = (
  id: string,
  grade: string,
  name: string,
  group: { id: string; name: string } | null = null,
) => ({
  id,
  grade,
  groupId: group?.id ?? null,
  groupName: group?.name ?? null,
  name,
  hasHomeroom: true,
});

const CLASSES = "GET /api/console/classes";
const STUDENTS_URL = "GET /api/console/students/history?page=1";

function studentsBody(items: unknown[], total = items.length) {
  return { total, page: 1, pageCount: Math.ceil(total / 50), items };
}

function stubStudents(
  routesOver: Record<string, ApiHandler> = {},
  me: unknown = homeroomMe,
) {
  return stubPage(
    {
      [CLASSES]: {
        body: {
          classes: [
            klass("c3", "고2", "3"),
            klass("c5", "고2", "5"),
            klass("c9", "고1", "9"),
          ],
        },
      },
      [STUDENTS_URL]: { body: studentsBody([student(1), student(2)]) },
      ...routesOver,
    },
    me,
  );
}

describe("W13 학생 조회와 이력 탭", () => {
  it("학생마다 학년그룹, 학년도별 반 이력, 이용 서비스 수를 보여 준다", async () => {
    stubStudents();

    renderRoutes(routes, "/teacher/student-history?tab=students");

    expect(await screen.findByText("검색 결과 2명")).toBeTruthy();
    for (const head of [
      "이름",
      "학년그룹",
      "학년그룹/반 이력",
      "이용 서비스 수",
    ]) {
      expect(screen.getByRole("columnheader", { name: head })).toBeTruthy();
    }
    const r = row("김서연");
    expect(within(r).getByText("2학년")).toBeTruthy();
    expect(within(r).getByText("2026 2학년 3반 / 2025 1학년 5반")).toBeTruthy();
    expect(within(r).getByText("6/6")).toBeTruthy();
    expect(
      screen.getByText("담임은 현재 반만, 관리자는 전교가 보여요"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "직접 변경" })).toBeNull();
    expect(screen.getByText("1 / 1 페이지, 1~2번째")).toBeTruthy();
  });

  it("학교 관리자에게는 행마다 직접 변경 버튼이 있다", async () => {
    stubStudents({}, adminMe);

    renderRoutes(routes, "/teacher/student-history?tab=students");

    await screen.findByText("검색 결과 2명");
    expect(screen.getAllByRole("button", { name: "직접 변경" })).toHaveLength(
      2,
    );
  });

  it("학생이 없으면 안내만 보이고 쪽 이동은 없다", async () => {
    stubStudents({ [STUDENTS_URL]: { body: studentsBody([]) } });

    renderRoutes(routes, "/teacher/student-history?tab=students");

    expect(await screen.findByText("검색 결과 0명")).toBeTruthy();
    expect(
      screen.getByText(
        "찾는 학생이 없어요. 이름이나 학년그룹, 반을 바꿔 보세요",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("담임은 현재 반만, 관리자는 전교가 보여요"),
    ).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "쪽 이동" })).toBeNull();
  });
});

describe("W13 학생 조회 필터", () => {
  const query = (pairs: string[][]) =>
    `GET /api/console/students/history?${new URLSearchParams(pairs)}`;
  const select = (label: string) =>
    screen.findByLabelText(label) as Promise<HTMLSelectElement>;

  it("학년그룹을 고르기 전에는 반을 막고, 검색을 누르면 조건대로 다시 불러온다", async () => {
    const FILTERED = query([
      ["grade", "고2"],
      ["classId", "c5"],
      ["q", "도윤"],
      ["page", "1"],
    ]);
    const calls = stubStudents({
      [FILTERED]: { body: studentsBody([student(2)]) },
    });
    const { router } = renderRoutes(
      routes,
      "/teacher/student-history?tab=students",
    );
    const grade = await select("학년그룹");
    const klassSelect = await select("반");
    expect(klassSelect.disabled).toBe(true);
    expect(
      within(grade)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["전체", "1학년", "2학년"]);

    fireEvent.change(grade, { target: { value: "고2" } });
    expect(klassSelect.disabled).toBe(false);
    expect(
      within(klassSelect)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["전체", "3반", "5반"]);
    fireEvent.change(klassSelect, { target: { value: "c5" } });
    fireEvent.change(screen.getByPlaceholderText("이름 검색"), {
      target: { value: "도윤" },
    });
    expect(calls.some((c) => c.key === FILTERED)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(await screen.findByText("검색 결과 1명")).toBeTruthy();
    expect(screen.queryByText("김서연")).toBeNull();
    expect(router.state.location.search).toBe(
      `?${new URLSearchParams([
        ["tab", "students"],
        ["grade", "고2"],
        ["classId", "c5"],
        ["q", "도윤"],
      ])}`,
    );
  });

  it("학년그룹을 바꾸면 고른 반을 비우고 그룹은 그 학년의 것만 보인다", async () => {
    stubStudents({
      [CLASSES]: {
        body: {
          classes: [
            klass("c3", "고2", "3"),
            klass("c9", "고1", "9", { id: "g1", name: "A레벨" }),
          ],
        },
      },
    });
    renderRoutes(routes, "/teacher/student-history?tab=students");
    const grade = await select("학년그룹");
    const group = await select("그룹");
    const klassSelect = await select("반");
    expect(
      within(group)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["전체", "A레벨"]);

    fireEvent.change(grade, { target: { value: "고2" } });
    expect(
      within(group)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["전체"]);
    fireEvent.change(klassSelect, { target: { value: "c3" } });
    fireEvent.change(grade, { target: { value: "고1" } });

    expect(klassSelect.value).toBe("");
  });
});

const HISTORY_DIALOG =
  "GET /api/console/students/enrollment-history?studentId=s1";
const historyBody = (over: Record<string, unknown> = {}) => ({
  studentId: "s1",
  name: "김서연",
  linkedServices: ["goal", "diagnosis", "inquiry"],
  years: [
    {
      schoolYear: 2026,
      grade: "고2",
      groupName: null,
      className: "3",
      number: 1,
      current: true,
    },
    {
      schoolYear: 2025,
      grade: "고1",
      groupName: "A레벨",
      className: "5",
      number: 12,
      current: false,
    },
  ],
  canOpenCoaching: true,
  ...over,
});

describe("W13a 학년도별 이력 창", () => {
  const openHistory = async (name = "김서연") => {
    await screen.findByText("검색 결과 2명");
    fireEvent.click(screen.getByText(name));
    return screen.findByRole("dialog");
  };

  it("학년도별 학년그룹, 반, 번호와 연결된 서비스를 보이고 코칭으로 보낸다", async () => {
    stubStudents({ [HISTORY_DIALOG]: { body: historyBody() } });
    const { router } = renderRoutes(
      routes,
      "/teacher/student-history?tab=students",
    );

    const dialog = await openHistory();

    expect(
      await within(dialog).findByText("김서연 학년도별 이력"),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "연결된 서비스 데이터: 학습진단, 목표관리, 심화탐구(3/6). 학년이나 반이 바뀌어도 기록은 그대로 이어져요",
      ),
    ).toBeTruthy();
    for (const head of ["학년도", "학년그룹, 그룹", "반", "번호"]) {
      expect(
        within(dialog).getByRole("columnheader", { name: head }),
      ).toBeTruthy();
    }
    const current = within(dialog)
      .getByText("2026")
      .closest("tr") as HTMLElement;
    expect(within(current).getByText("2학년, 그룹 없음")).toBeTruthy();
    expect(within(current).getByText("3반")).toBeTruthy();
    expect(within(current).getByText("1번")).toBeTruthy();
    expect(within(current).getByText("현재")).toBeTruthy();
    const past = within(dialog).getByText("2025").closest("tr") as HTMLElement;
    expect(within(past).getByText("1학년, A레벨")).toBeTruthy();
    expect(within(past).queryByText("현재")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "코칭" }));

    expect(await screen.findByText("코칭 화면")).toBeTruthy();
    expect(router.state.location.pathname + router.state.location.search).toBe(
      "/teacher/coaching?studentId=s1",
    );
  });

  it("닫기를 누르면 창이 닫힌다", async () => {
    stubStudents({ [HISTORY_DIALOG]: { body: historyBody() } });
    renderRoutes(routes, "/teacher/student-history?tab=students");
    const dialog = await openHistory();

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("서버가 403 을 주면 권한 안내를 보이고 코칭을 막는다(목록의 이름을 제목에 쓴다)", async () => {
    stubStudents({
      [HISTORY_DIALOG]: {
        status: 403,
        body: { error: { code: "FORBIDDEN", message: "x" } },
      },
    });
    renderRoutes(routes, "/teacher/student-history?tab=students");
    const dialog = await openHistory();

    expect(
      await within(dialog).findByText(
        "이 학생의 코칭 화면을 열람할 권한이 없습니다.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "현재 담임교사와 학교 전체 관리자만 열람할 수 있습니다.",
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText("김서연 학년도별 이력")).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "코칭",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("코칭을 열 수 없는 학생이면 이력과 함께 권한 안내를 보인다", async () => {
    stubStudents({
      [HISTORY_DIALOG]: { body: historyBody({ canOpenCoaching: false }) },
    });
    renderRoutes(routes, "/teacher/student-history?tab=students");
    const dialog = await openHistory();

    expect(
      await within(dialog).findByText(
        "이 학생의 코칭 화면을 열람할 권한이 없습니다.",
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText("2025")).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "코칭",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

const PATCH = "PATCH /api/console/students/enrollment";
const SCHOOL_YEAR = "GET /api/console/school-year";

describe("W13b 학생 정보 직접 변경", () => {
  const openDirect = async (over: Record<string, ApiHandler> = {}) => {
    const calls = stubStudents(
      {
        [SCHOOL_YEAR]: { body: { schoolYear: 2026 } },
        [PATCH]: { body: { ok: true, enrollmentId: "e1", version: 5 } },
        ...over,
      },
      adminMe,
    );
    renderRoutes(routes, "/teacher/student-history?tab=students");
    await screen.findByText("검색 결과 2명");
    fireEvent.click(
      within(row("김서연")).getByRole("button", { name: "직접 변경" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "학생 정보 직접 변경",
    });
    await within(dialog).findByLabelText("새 번호");
    return { calls, dialog };
  };
  const saveButton = (dialog: HTMLElement) =>
    within(dialog).getByRole("button", { name: "저장" }) as HTMLButtonElement;
  const setNumber = (dialog: HTMLElement, value: string) =>
    fireEvent.change(within(dialog).getByLabelText("새 번호"), {
      target: { value },
    });
  const setReason = (dialog: HTMLElement, value: string) =>
    fireEvent.change(within(dialog).getByLabelText("사유"), {
      target: { value },
    });

  it("지금 값을 채워 보이고 바뀐 것이 없으면 저장을 막는다", async () => {
    const { dialog } = await openDirect();

    expect(within(dialog).getByText("대상 학생: 김서연")).toBeTruthy();
    expect(
      within(dialog).getByText("지금 2학년 3반 1번, 그룹 없음"),
    ).toBeTruthy();
    expect(
      (within(dialog).getByLabelText("새 학년그룹") as HTMLSelectElement).value,
    ).toBe("고2");
    expect(
      (within(dialog).getByLabelText("새 반") as HTMLSelectElement).value,
    ).toBe("c3");
    expect(
      (within(dialog).getByLabelText("새 번호") as HTMLInputElement).value,
    ).toBe("1");
    expect(
      (within(dialog).getByLabelText("적용 학년도") as HTMLSelectElement).value,
    ).toBe("2026");
    expect(
      within(dialog).getByLabelText("적용 학년도").querySelectorAll("option")
        .length,
    ).toBe(2);
    expect(
      Array.from(
        within(dialog).getByLabelText("사유").querySelectorAll("option"),
      )
        .map((o) => o.textContent)
        .slice(1),
    ).toEqual(["자동", "진급", "반 변경", "번호 변경", "전입과 전학", "정정"]);
    expect(
      within(dialog).getByText(
        "사유: 자동, 진급, 반 변경, 번호 변경, 전입과 전학, 정정 중 선택",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(
        "옮길 반에 담임이 없으면 안내만 하고 바로 반영해요",
      ),
    ).toBeTruthy();
    expect(saveButton(dialog).disabled).toBe(true);

    setNumber(dialog, "36");
    expect(saveButton(dialog).disabled).toBe(false);
    setNumber(dialog, "1");
    expect(saveButton(dialog).disabled).toBe(true);
  });

  it("저장하면 바뀐 값과 사유를 보내고 닫은 뒤 목록을 다시 불러온다", async () => {
    const { calls, dialog } = await openDirect();
    setNumber(dialog, "36");
    setReason(dialog, "number_change");

    fireEvent.click(saveButton(dialog));

    expect(await screen.findByText("김서연 학생 정보를 바꿨어요")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.find((c) => c.key === PATCH)?.body).toEqual({
      studentId: "s1",
      expectedVersion: 4,
      grade: "고2",
      classId: "c3",
      number: 36,
      reason: "number_change",
      applyYear: 2026,
    });
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.key === STUDENTS_URL)).toHaveLength(2),
    );
  });

  it("번호가 이미 쓰이면 새 번호 칸 아래에 쓰는 학생을 보이고 값은 그대로 둔다", async () => {
    const { dialog } = await openDirect({
      [PATCH]: {
        status: 409,
        body: {
          error: { code: "NUMBER_TAKEN", message: "이미 사용 중인 번호예요." },
          occupant: {
            grade: "고2",
            className: "3",
            number: 7,
            displayName: "윤*린",
          },
        },
      },
    });
    setNumber(dialog, "7");

    fireEvent.click(saveButton(dialog));

    expect(
      await within(dialog).findByText(
        "이미 사용 중인 번호예요(2학년 3반 7번, 윤*린). 다른 번호를 골라 주세요",
      ),
    ).toBeTruthy();
    expect(
      (within(dialog).getByLabelText("새 번호") as HTMLInputElement).value,
    ).toBe("7");
  });

  it("다른 분이 먼저 바꿨으면 안내하고 목록을 다시 불러와 새 버전으로 저장한다", async () => {
    let version = 4;
    let patches = 0;
    const { calls, dialog } = await openDirect({
      [STUDENTS_URL]: () => {
        const item = student(1);
        item.enrollment.version = version;
        return { body: studentsBody([item, student(2)]) };
      },
      [PATCH]: () => {
        patches += 1;
        if (patches === 1) {
          version = 5;
          return {
            status: 409,
            body: {
              error: {
                code: "VERSION_CONFLICT",
                message: "다른 분이 먼저 바꿨어요. 새로 고침해 주세요.",
              },
            },
          };
        }
        return { body: { ok: true, enrollmentId: "e1", version: 6 } };
      },
    });
    setNumber(dialog, "36");

    fireEvent.click(saveButton(dialog));

    expect(
      await within(dialog).findByText(
        "다른 분이 먼저 바꿨어요. 새로 고침해 주세요",
      ),
    ).toBeTruthy();
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.key === STUDENTS_URL)).toHaveLength(2),
    );
    expect(
      (within(dialog).getByLabelText("새 번호") as HTMLInputElement).value,
    ).toBe("36");

    fireEvent.click(saveButton(dialog));

    await vi.waitFor(() =>
      expect(calls.filter((c) => c.key === PATCH).at(-1)?.body).toMatchObject({
        expectedVersion: 5,
        number: 36,
      }),
    );
  });

  it("다음 학년도를 고르면 그 학년도의 학급으로 반을 다시 고르게 한다", async () => {
    const { calls, dialog } = await openDirect({
      "GET /api/console/classes?year=2027": {
        body: { classes: [klass("n3", "고2", "3"), klass("n4", "고2", "4")] },
      },
    });

    fireEvent.change(within(dialog).getByLabelText("적용 학년도"), {
      target: { value: "2027" },
    });

    await vi.waitFor(() =>
      expect(
        Array.from(
          within(dialog).getByLabelText("새 반").querySelectorAll("option"),
        ).map((o) => o.textContent),
      ).toEqual(["선택", "3반", "4반"]),
    );
    expect(saveButton(dialog).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("새 반"), {
      target: { value: "n4" },
    });
    fireEvent.click(saveButton(dialog));

    await vi.waitFor(() =>
      expect(calls.find((c) => c.key === PATCH)?.body).toMatchObject({
        classId: "n4",
        applyYear: 2027,
        number: 1,
      }),
    );
  });
});
