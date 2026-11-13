// W6 학생 관리. 목록, 필터, 탭, 상태(빈 목록, 학생 없음, 불러오는 중)와 W6a 상세, W6b 편집 창을 검증한다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
import StudentListPage from "./StudentListPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "students", Component: StudentListPage },
          { path: "student-history", Component: () => <p>학년 변경 화면</p> },
          { path: "coaching", Component: () => <p>코칭 화면</p> },
        ],
      },
    ],
  },
];

const allServices = {
  diagnosis: true,
  goal: true,
  growth: true,
  performance: true,
  selfeval: true,
  inquiry: true,
};
const noServices = {
  diagnosis: false,
  goal: false,
  growth: false,
  performance: false,
  selfeval: false,
  inquiry: false,
};

const student = (n: number, over: Record<string, unknown> = {}) => ({
  studentId: `s${n}`,
  displayName: n === 1 ? "김서연" : "이서준",
  joinedAt: "2026-03-02",
  grade: "고2",
  groupName: null,
  className: "3",
  number: n,
  services: n === 1 ? allServices : noServices,
  serviceCount: n === 1 ? 6 : 0,
  urgency: n === 1 ? "mid" : null,
  weeklyGoalRate: n === 1 ? 72 : null,
  weeklyGoalLevel: n === 1 ? "high" : null,
  specialReasons: [] as string[],
  groupId: null,
  classId: "c3",
  canEdit: true,
  enrollmentVersion: 1,
  ...over,
});

const classes = {
  classes: [
    {
      id: "c1",
      grade: "고3",
      groupId: null,
      groupName: null,
      name: "1",
      hasHomeroom: false,
    },
    {
      id: "c3",
      grade: "고2",
      groupId: null,
      groupName: null,
      name: "3",
      hasHomeroom: true,
    },
    {
      id: "c5",
      grade: "고2",
      groupId: null,
      groupName: null,
      name: "5",
      hasHomeroom: true,
    },
  ],
};

const GRADE2 = encodeURIComponent("고2");
const LIST_URL = `GET /api/console/students?grade=${GRADE2}&classId=c3&page=1`;

function listBody(items: unknown[], extra: Record<string, unknown> = {}) {
  return {
    total: items.length,
    scopeTotal: items.length,
    page: 1,
    pageSize: 50,
    pageCount: 1,
    orgType: "학교",
    items,
    ...extra,
  };
}

function stubPage(
  routesOver: Record<string, ApiHandler> = {},
  me: unknown = homeroomMe,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/classes": { body: classes },
    [LIST_URL]: { body: listBody([student(1), student(2, { number: null })]) },
    ...routesOver,
  });
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

describe("W6 학생 관리 default", () => {
  it("담임의 대표 반 학생을 필터 값과 함께 표로 보여 준다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/students");

    expect(await screen.findByText("김서연")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "학생 관리" }),
    ).toBeTruthy();
    expect(
      screen.getByText("학생을 조회하고 상세 정보를 확인합니다."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "학년 변경 바로가기" }),
    ).toBeTruthy();
    for (const tab of [
      "전체",
      "학습진단",
      "목표관리",
      "성장설계",
      "수행평가",
      "자기평가",
      "심화탐구",
      "서비스 미이용 학생",
    ]) {
      expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "검색 결과 2명" })).toBeTruthy();
    for (const head of [
      "학습진단 긴급도",
      "이름 (가입일)",
      "학년그룹/반/번호",
      "주간 목표시간 달성율",
      "이용서비스",
    ]) {
      expect(screen.getByRole("columnheader", { name: head })).toBeTruthy();
    }
    const row = screen.getByText("김서연").closest("tr") as HTMLElement;
    expect(within(row).getByText("2026.03.02")).toBeTruthy();
    expect(within(row).getByText("2학년 3반")).toBeTruthy();
    expect(within(row).getByText("1번")).toBeTruthy();
    expect(within(row).getByText("보통")).toBeTruthy();
    expect(within(row).getByText("72%")).toBeTruthy();
    expect(within(row).getByText("6/6")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "편집하기" })).toBeTruthy();
    const second = screen.getByText("이서준").closest("tr") as HTMLElement;
    expect(within(second).getByText("번호 미입력")).toBeTruthy();
    expect(within(second).getByText("0/6")).toBeTruthy();
    expect(within(second).getByTestId("rate-empty")).toBeTruthy();
  });
});

describe("W6 학생 관리 미회원가입", () => {
  it("가입 전 줄은 미회원가입 표시와 함께 보이고, 이름을 눌러도 상세가 열리지 않으며 편집하기가 없다", async () => {
    const calls = stubPage({
      [LIST_URL]: {
        body: listBody([
          student(1),
          student(2, {
            pending: true,
            studentId: "p1",
            displayName: "한가입",
            joinedAt: null,
            canEdit: false,
            services: noServices,
            serviceCount: 0,
          }),
        ]),
      },
    });

    renderRoutes(routes, "/teacher/students");

    const row = (await screen.findByText("한가입")).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("미회원가입")).toBeTruthy();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(within(row).getByText("2학년 3반")).toBeTruthy();
    const real = screen.getByText("김서연").closest("tr") as HTMLElement;
    expect(within(real).queryByText("미회원가입")).toBeNull();
    expect(within(real).getByRole("button", { name: "편집하기" })).toBeTruthy();
    expect(calls.some((c) => c.key.includes("/students/detail"))).toBe(false);
  });
});

describe("W6 학생 관리 상태", () => {
  it("범위 안에 학생이 없으면 안내만 보이고 버튼은 없다", async () => {
    stubPage({
      [LIST_URL]: { body: listBody([], { scopeTotal: 0 }) },
    });

    renderRoutes(routes, "/teacher/students");

    expect(
      await screen.findByText(
        "연결된 학생이 없습니다. 학생들이 가입하면 자동으로 표시됩니다",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "검색 결과 0명" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "필터 지우기" })).toBeNull();
  });

  it("조건에 맞는 학생이 없으면 안내와 필터 지우기를 보이고, 누르면 조건 없이 다시 조회한다", async () => {
    const calls = stubPage({
      [LIST_URL]: { body: listBody([], { scopeTotal: 28 }) },
      "GET /api/console/students?page=1": {
        body: listBody([student(1)], { scopeTotal: 28 }),
      },
    });

    renderRoutes(routes, "/teacher/students");

    expect(
      await screen.findByText(
        "조건에 맞는 학생이 없습니다. 필터 조건을 조정해 보세요.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "필터 지우기" }));

    expect(await screen.findByText("김서연")).toBeTruthy();
    expect(calls.map((c) => c.key)).toContain(
      "GET /api/console/students?page=1",
    );
  });

  it("불러오는 동안 제목과 필터는 남고 표 대신 자리표시가 보인다", async () => {
    stubPage();
    const respond = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/api/console/students")
        ? new Promise<Response>(() => {})
        : respond(input, init),
    );

    renderRoutes(routes, "/teacher/students");

    expect(
      await screen.findByRole("heading", { level: 1, name: "학생 관리" }),
    ).toBeTruthy();
    expect(await screen.findByRole("button", { name: "검색" })).toBeTruthy();
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(screen.queryByRole("columnheader")).toBeNull();
  });

  it("목록을 읽지 못하면 오류 안내를 보인다", async () => {
    stubPage({ [LIST_URL]: { status: 500, body: {} } });

    renderRoutes(routes, "/teacher/students");

    expect(
      await screen.findByText(
        "학생 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });
});

describe("W6 학생 관리 역할과 조회", () => {
  it("학년 변경 바로가기는 W13 으로 보낸다", async () => {
    stubPage();
    renderRoutes(routes, "/teacher/students");

    fireEvent.click(
      await screen.findByRole("button", { name: "학년 변경 바로가기" }),
    );

    expect(await screen.findByText("학년 변경 화면")).toBeTruthy();
  });

  it("담임이 여러 반을 맡으면 반 칸에서 맡은 반을 고르고, 검색하면 그 반으로 조회한다", async () => {
    const calls = stubPage({
      [`GET /api/console/students?grade=${GRADE2}&classId=c5&page=1`]: {
        body: listBody([student(2, { className: "5" })]),
      },
    });
    renderRoutes(routes, "/teacher/students");
    await screen.findByText("김서연");

    const select = screen.getByLabelText("반") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "전체",
      "3반 (주)",
      "5반",
    ]);
    fireEvent.change(select, { target: { value: "c5" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(await screen.findByText("이서준")).toBeTruthy();
    expect(calls.map((c) => c.key)).toContain(
      `GET /api/console/students?grade=${GRADE2}&classId=c5&page=1`,
    );
  });

  it("서비스 탭을 누르면 그 서비스를 쓴 학생만 요청한다", async () => {
    const calls = stubPage({
      [`GET /api/console/students?tab=growth&grade=${GRADE2}&classId=c3&page=1`]:
        { body: listBody([student(1)]) },
    });
    renderRoutes(routes, "/teacher/students");
    await screen.findByText("김서연");

    fireEvent.click(screen.getByRole("tab", { name: "성장설계" }));

    await waitFor(() =>
      expect(calls.map((c) => c.key)).toContain(
        `GET /api/console/students?tab=growth&grade=${GRADE2}&classId=c3&page=1`,
      ),
    );
  });

  it("학교 관리자는 전교를 보고 편집하기 없이, 반은 학년을 고른 뒤에만 열린다", async () => {
    stubPage(
      {
        "GET /api/console/students?page=1": {
          body: listBody([student(1, { displayName: "김*연" })], {
            scopeTotal: 450,
          }),
        },
      },
      adminMe,
    );
    renderRoutes(routes, "/teacher/students");

    expect(await screen.findByText("김*연")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "편집하기" })).toBeNull();
    const select = screen.getByLabelText("반") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(screen.getByText("학년그룹을 먼저 골라요")).toBeTruthy();
    expect(screen.queryByLabelText("그룹")).toBeNull();
    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "고2" },
    });
    expect((screen.getByLabelText("반") as HTMLSelectElement).disabled).toBe(
      false,
    );
  });

  it("학원은 그룹 칸이 더해지고 학년 칸에 그룹이 붙는다", async () => {
    stubPage(
      {
        "GET /api/console/students?page=1": {
          body: listBody(
            [student(1, { grade: "고1", groupName: "A레벨", className: "1" })],
            { orgType: "학원" },
          ),
        },
      },
      adminMe,
    );
    renderRoutes(routes, "/teacher/students");

    expect(await screen.findByText("1학년-A레벨 1반")).toBeTruthy();
    expect(screen.getByLabelText("그룹")).toBeTruthy();
  });
});

describe("W6 학생 관리 그룹 선택지", () => {
  const academyList = {
    "GET /api/console/students?page=1": {
      body: listBody([student(1, { grade: "고1", className: "1" })], {
        orgType: "학원",
      }),
    },
  };

  it("학급이 없는 그룹도 그룹 관리와 같은 순서로 그룹 칸에 나온다", async () => {
    stubPage(
      {
        ...academyList,
        "GET /api/console/groups": {
          body: {
            groups: [
              { id: "g1", name: "A레벨", studentCount: 0 },
              { id: "g2", name: "B레벨", studentCount: 0 },
            ],
          },
        },
      },
      adminMe,
    );
    renderRoutes(routes, "/teacher/students");

    const select = (await screen.findByLabelText("그룹")) as HTMLSelectElement;
    await waitFor(() =>
      expect([...select.options].map((o) => o.text)).toEqual([
        "전체",
        "A레벨",
        "B레벨",
      ]),
    );
  });
});

describe("W6 학생 관리 학교 계정", () => {
  it("그룹 칸이 없고 그룹 목록도 읽지 않는다", async () => {
    const calls = stubPage(
      {
        "GET /api/console/students?page=1": {
          body: listBody([student(1, { grade: "고1", className: "1" })]),
        },
      },
      adminMe,
    );
    renderRoutes(routes, "/teacher/students");

    await screen.findByText("김서연");
    expect(screen.queryByLabelText("그룹")).toBeNull();
    expect(calls.some((c) => c.key.includes("/api/console/groups"))).toBe(
      false,
    );
  });
});

describe("W6 학생 관리 휴대폰", () => {
  afterEach(() => {
    window.innerWidth = 1024;
  });

  it("표 대신 카드로 보이고 이름 아래에 학년 반 번호와 긴급도 라벨이 붙는다", async () => {
    window.innerWidth = 500;
    stubPage();
    renderRoutes(routes, "/teacher/students");

    expect(await screen.findByText("김서연")).toBeTruthy();
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(screen.getByText("2학년 3반 1번")).toBeTruthy();
    expect(screen.getAllByText("학습진단 긴급도").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "편집하기" })).toHaveLength(2);
  });
});

const detail = {
  studentId: "s1",
  name: "김서연",
  joinedAt: "2026-03-02",
  flagged: false,
  summaries: {
    diagnosis: "학교생활 준비도 71",
    goal: null,
    growth: '대주제 "지속가능한 도시"',
    performance: null,
    selfeval: null,
    inquiry: null,
  },
  enrollment: {
    grade: "고2",
    groupName: null,
    className: "3",
    number: 1,
    homeroomName: "박지훈",
  },
  history: [
    {
      schoolYear: 2026,
      grade: "고2",
      groupName: null,
      className: "3",
      number: 1,
    },
    {
      schoolYear: 2025,
      grade: "고1",
      groupName: null,
      className: "5",
      number: 4,
    },
  ],
  services: { ...allServices, inquiry: false },
  usage: [
    ["diagnosis", null, null, null],
    ["goal", null, null, null],
    ["growth", null, null, null],
    ["performance", 0, null, 21],
    ["selfeval", null, null, null],
    ["inquiry", 0, 3, null],
  ].map(([key, used, monthRemaining, termRemaining]) => ({
    key,
    monthUsed: used,
    monthLimit: monthRemaining,
    monthRemaining,
    termUsed: null,
    termLimit: termRemaining,
    termRemaining,
  })),
};
const DETAIL_URL = "GET /api/console/students/detail?studentId=s1";

describe("W6a 학생 상세", () => {
  it("최근 접속은 한국 날짜로 오늘 또는 n일 전을 정보 줄에 붙이고 기록이 없으면 붙이지 않는다", async () => {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-11-05T01:00:00Z"),
    });
    try {
      stubPage({
        [DETAIL_URL]: {
          body: { ...detail, lastSeenAt: "2026-11-04T14:30:00Z" },
        },
      });
      const first = renderRoutes(routes, "/teacher/students");
      fireEvent.click(await screen.findByText("김서연"));
      expect(
        await screen.findByText("2학년 3반 1번, 담임 박지훈, 최근 접속 1일 전"),
      ).toBeTruthy();
      first.unmount();

      stubPage({
        [DETAIL_URL]: {
          body: { ...detail, lastSeenAt: "2026-11-04T15:30:00Z" },
        },
      });
      const second = renderRoutes(routes, "/teacher/students");
      fireEvent.click(await screen.findByText("김서연"));
      expect(
        await screen.findByText("2학년 3반 1번, 담임 박지훈, 최근 접속 오늘"),
      ).toBeTruthy();
      second.unmount();

      stubPage({ [DETAIL_URL]: { body: { ...detail, lastSeenAt: null } } });
      renderRoutes(routes, "/teacher/students");
      fireEvent.click(await screen.findByText("김서연"));
      expect(
        await screen.findByText("2학년 3반 1번, 담임 박지훈"),
      ).toBeTruthy();
      expect(screen.queryByText(/최근 접속/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("이름을 누르면 실명 제목과 학년반 이력, 서비스 이용, 사용 횟수를 창으로 보여 준다", async () => {
    stubPage({ [DETAIL_URL]: { body: detail } });
    renderRoutes(routes, "/teacher/students");

    fireEvent.click(await screen.findByText("김서연"));

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByRole("heading", { name: "김서연" }),
    ).toBeTruthy();
    expect(within(dialog).getByText("2학년 3반 1번, 담임 박지훈")).toBeTruthy();
    expect(within(dialog).getByText("학교생활 준비도 71")).toBeTruthy();
    expect(within(dialog).getByText('대주제 "지속가능한 도시"')).toBeTruthy();
    const history = within(dialog)
      .getByText("2025")
      .closest("tr") as HTMLElement;
    expect(within(history).getByText("1학년")).toBeTruthy();
    expect(within(history).getByText("5반")).toBeTruthy();
    expect(within(history).getByText("4번")).toBeTruthy();
    const inquiry = within(dialog)
      .getAllByText("심화탐구")
      .map((e) => e.closest("tr") as HTMLElement);
    expect(within(inquiry[0] as HTMLElement).getByText("이용 전")).toBeTruthy();
    const usage = inquiry[1] as HTMLElement;
    expect(within(usage).getByText("3")).toBeTruthy();
    expect(within(usage).getByText("해당 없음")).toBeTruthy();
    const perf = within(dialog)
      .getAllByText("수행평가")[1]
      ?.closest("tr") as HTMLElement;
    expect(within(perf).getByText("21")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "이번 달 남은 횟수는 매월 1일에, 학기 남은 횟수는 학기가 바뀔 때 새로 채워져요. 횟수는 본사에서 정하고 여기서는 볼 수만 있어요.",
      ),
    ).toBeTruthy();
  });

  it("닫기는 창을 닫고 개인종합코칭으로는 그 학생의 W9 로 보낸다", async () => {
    stubPage({ [DETAIL_URL]: { body: detail } });
    renderRoutes(routes, "/teacher/students");
    fireEvent.click(await screen.findByText("김서연"));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("김서연"));
    const again = await screen.findByRole("dialog");
    const coaching = within(again).getByRole("button", {
      name: "개인종합코칭으로",
    }) as HTMLButtonElement;
    await waitFor(() => expect(coaching.disabled).toBe(false));
    fireEvent.click(coaching);

    expect(await screen.findByText("코칭 화면")).toBeTruthy();
  });

  it("상세를 읽지 못하면 오류 안내를 보인다", async () => {
    stubPage({ [DETAIL_URL]: { status: 404, body: {} } });
    renderRoutes(routes, "/teacher/students");

    fireEvent.click(await screen.findByText("김서연"));

    expect(
      await screen.findByText(
        "학생 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });
});

const PATCH_URL = "PATCH /api/console/students/enrollment";

async function openEdit() {
  renderRoutes(routes, "/teacher/students");
  const row = (await screen.findByText("김서연")).closest("tr") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "편집하기" }));
  return await screen.findByRole("dialog");
}

describe("W6b 학생 정보 편집", () => {
  it("현재 값이 채워진 네 칸을 보이고, 바꾸지 않으면 저장할 수 없으며 안내문은 없다", async () => {
    stubPage();
    const dialog = await openEdit();

    expect(
      within(dialog).getByRole("heading", { name: "학생 정보 편집" }),
    ).toBeTruthy();
    expect(
      (within(dialog).getByLabelText("학년") as HTMLSelectElement).value,
    ).toBe("고2");
    expect(
      (within(dialog).getByLabelText("반") as HTMLSelectElement).value,
    ).toBe("c3");
    expect(
      (within(dialog).getByLabelText("번호") as HTMLInputElement).value,
    ).toBe("1");
    expect(
      within(dialog).getByLabelText(
        "그룹(레벨이 구분되어 있으면 입력, 없으면 빈칸)",
      ),
    ).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "저장",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(within(dialog).queryByText(/알림이 가요/)).toBeNull();
  });

  it("반과 번호를 바꿔 저장하면 현재 버전으로 PATCH 하고 닫은 뒤 알림을 보이고 목록을 다시 읽는다", async () => {
    const calls = stubPage({
      [PATCH_URL]: { body: { ok: true, enrollmentId: "e1", version: 2 } },
    });
    const dialog = await openEdit();

    fireEvent.change(within(dialog).getByLabelText("반"), {
      target: { value: "c5" },
    });
    fireEvent.change(within(dialog).getByLabelText("번호"), {
      target: { value: "12" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(await screen.findByText("김서연 학생 정보를 바꿨어요")).toBeTruthy();
    expect(calls.find((c) => c.key === PATCH_URL)?.body).toEqual({
      studentId: "s1",
      expectedVersion: 1,
      grade: "고2",
      classId: "c5",
      number: 12,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      calls.filter((c) => c.key === LIST_URL).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("학원은 다학년 학급이 있으면 어느 학년이든 골라 다학년 학급에 옮기고, 학생 학년으로 mixed 를 보내지 않는다", async () => {
    const academyMe = {
      ...homeroomMe,
      tenant: { ...homeroomMe.tenant, orgType: "사기업" },
    };
    const calls = stubPage(
      {
        "GET /api/console/classes": {
          body: {
            classes: [
              ...classes.classes,
              {
                id: "cm",
                grade: null,
                groupId: null,
                groupName: null,
                name: "다",
                hasHomeroom: true,
              },
            ],
          },
        },
        [PATCH_URL]: { body: { ok: true, enrollmentId: "e1", version: 2 } },
      },
      academyMe,
    );
    const dialog = await openEdit();
    const gradeSelect = within(dialog).getByLabelText("학년");

    expect(
      within(gradeSelect)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["중1", "중2", "중3", "고1", "고2", "고3"]);
    fireEvent.change(gradeSelect, { target: { value: "고1" } });
    expect(
      within(within(dialog).getByLabelText("반"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["선택", "다반"]);
    fireEvent.change(within(dialog).getByLabelText("반"), {
      target: { value: "cm" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(calls.find((c) => c.key === PATCH_URL)?.body).toEqual({
        studentId: "s1",
        expectedVersion: 1,
        grade: "고1",
        classId: "cm",
        number: 1,
      }),
    );
  });

  it("다학년 학급의 학생이 학년만 고치면 고른 학급과 그룹을 그대로 둔다", async () => {
    const academyMe = {
      ...homeroomMe,
      tenant: { ...homeroomMe.tenant, orgType: "사기업" },
    };
    stubPage(
      {
        "GET /api/console/classes": {
          body: {
            classes: [
              ...classes.classes,
              {
                id: "cm",
                grade: null,
                groupId: null,
                groupName: null,
                name: "다",
                hasHomeroom: true,
              },
            ],
          },
        },
        [LIST_URL]: {
          body: listBody([student(1, { classId: "cm", className: "다" })]),
        },
      },
      academyMe,
    );
    const dialog = await openEdit();
    expect(
      (within(dialog).getByLabelText("반") as HTMLSelectElement).value,
    ).toBe("cm");

    fireEvent.change(within(dialog).getByLabelText("학년"), {
      target: { value: "고1" },
    });

    expect(
      (within(dialog).getByLabelText("반") as HTMLSelectElement).value,
    ).toBe("cm");
    expect(
      (
        within(dialog).getByRole("button", {
          name: "저장",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("학년을 바꾸면 D-day 와 내신 기준 안내가 더해지고 저장은 막히지 않는다", async () => {
    stubPage();
    const dialog = await openEdit();

    fireEvent.change(within(dialog).getByLabelText("학년"), {
      target: { value: "고3" },
    });
    fireEvent.change(within(dialog).getByLabelText("반"), {
      target: { value: "c1" },
    });

    expect(
      within(dialog).getByText(
        "학년이 바뀌면 목표관리 D-day와 내신 기준이 바뀌어요",
      ),
    ).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "저장",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("담임이 없는 반을 고르면 안내만 더하고 저장은 막히지 않는다", async () => {
    stubPage();
    const dialog = await openEdit();

    fireEvent.change(within(dialog).getByLabelText("학년"), {
      target: { value: "고3" },
    });
    fireEvent.change(within(dialog).getByLabelText("반"), {
      target: { value: "c1" },
    });

    expect(
      within(dialog).getByText(
        "옮길 반에는 담임이 없어요. 안내만 하고 그대로 반영해요",
      ),
    ).toBeTruthy();
  });

  it("번호가 이미 쓰이면 그 번호를 쓰는 학생 이름과 고치는 법을 번호 칸 아래에 보인다", async () => {
    stubPage({
      [PATCH_URL]: {
        status: 409,
        body: {
          error: { code: "NUMBER_TAKEN", message: "이미 사용 중인 번호예요." },
          occupant: {
            grade: "고2",
            className: "3",
            number: 2,
            displayName: "이서준",
          },
        },
      },
    });
    const dialog = await openEdit();

    fireEvent.change(within(dialog).getByLabelText("번호"), {
      target: { value: "2" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(
      await within(dialog).findByText(
        "이미 사용 중인 번호예요(2학년 3반 2번, 이서준). 다른 번호를 골라 주세요",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("다른 분이 먼저 바꿨으면 새로 고침 안내를 보이고 창은 열어 둔다", async () => {
    stubPage({
      [PATCH_URL]: {
        status: 409,
        body: {
          error: {
            code: "VERSION_CONFLICT",
            message: "다른 분이 먼저 바꿨어요. 새로 고침해 주세요.",
          },
        },
      },
    });
    const dialog = await openEdit();
    fireEvent.change(within(dialog).getByLabelText("번호"), {
      target: { value: "9" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(
      await within(dialog).findByText(
        "다른 분이 먼저 바꿨어요. 새로 고침해 주세요",
      ),
    ).toBeTruthy();
  });

  it("취소는 저장하지 않고 창을 닫는다", async () => {
    const calls = stubPage();
    const dialog = await openEdit();

    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.some((c) => c.key === PATCH_URL)).toBe(false);
  });
});

describe("W6 특이학생", () => {
  const SPECIAL_URL = `GET /api/console/students?grade=${GRADE2}&classId=c3&special=1&page=1`;

  it("특이학생만을 켜면 사유 열과 기준 문장이 더해진다", async () => {
    stubPage({
      [SPECIAL_URL]: {
        body: listBody(
          [
            student(1, {
              specialReasons: ["low_rate", "inactive", "urgency"],
            }),
            student(2, { specialReasons: ["feedback_wait", "manual"] }),
          ],
          {
            scopeTotal: 28,
            specialExecRatePct: 40,
            specialInactiveDays: 7,
            specialFeedbackWaitDays: 14,
          },
        ),
      },
    });
    renderRoutes(routes, "/teacher/students");
    const toggle = await screen.findByRole("button", { name: "특이학생만" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);

    expect(
      await screen.findByRole("columnheader", { name: "특이 사유" }),
    ).toBeTruthy();
    expect(await screen.findByText("달성율 40% 미만")).toBeTruthy();
    expect(screen.getByText("긴급도 높음 이상")).toBeTruthy();
    expect(screen.getByText("7일 이상 미접속")).toBeTruthy();
    expect(screen.getByText("수행평가 피드백 14일 이상 대기")).toBeTruthy();
    expect(screen.getByText("직접 지정")).toBeTruthy();
    const criteria = screen.getByText(/특이학생은/).textContent ?? "";
    for (const part of [
      "달성율",
      "접속하지 않았",
      "긴급도",
      "수행평가 피드백",
      "직접 지정",
    ])
      expect(criteria).toContain(part);
    expect(
      screen
        .getByRole("button", { name: "특이학생만" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("특이학생을 켜지 않으면 사유 열이 없다", async () => {
    stubPage();
    renderRoutes(routes, "/teacher/students");
    await screen.findByText("김서연");

    expect(
      screen.queryByRole("columnheader", { name: "특이 사유" }),
    ).toBeNull();
  });

  it("상세에서 특이학생으로 지정하면 서버에 알리고 버튼이 해제로 바뀐다", async () => {
    let flagged = false;
    const calls = stubPage({
      [DETAIL_URL]: () => ({ body: { ...detail, flagged } }),
      "POST /api/console/students/flag": () => {
        flagged = true;
        return { body: { ok: true, flagged: true } };
      },
    });
    renderRoutes(routes, "/teacher/students");
    fireEvent.click(await screen.findByText("김서연"));
    const dialog = await screen.findByRole("dialog");
    const button = await within(dialog).findByRole("button", {
      name: "특이학생으로 지정",
    });

    fireEvent.click(button);

    expect(
      await within(dialog).findByRole("button", { name: "특이학생 해제" }),
    ).toBeTruthy();
    expect(
      calls.find((c) => c.key === "POST /api/console/students/flag")?.body,
    ).toEqual({ studentId: "s1" });
  });

  it("지정된 학생은 해제할 수 있다", async () => {
    const calls = stubPage({
      [DETAIL_URL]: { body: { ...detail, flagged: true } },
      "DELETE /api/console/students/flag?studentId=s1": {
        body: { ok: true, flagged: false },
      },
    });
    renderRoutes(routes, "/teacher/students");
    fireEvent.click(await screen.findByText("김서연"));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(
      await within(dialog).findByRole("button", { name: "특이학생 해제" }),
    );

    await waitFor(() =>
      expect(calls.map((c) => c.key)).toContain(
        "DELETE /api/console/students/flag?studentId=s1",
      ),
    );
  });
});
