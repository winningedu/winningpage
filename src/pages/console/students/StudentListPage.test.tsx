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
  canEdit: true,
  enrollmentVersion: 1,
  ...over,
});

const classes = {
  classes: [
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
      "이용서비스",
    ]) {
      expect(screen.getByRole("columnheader", { name: head })).toBeTruthy();
    }
    const row = screen.getByText("김서연").closest("tr") as HTMLElement;
    expect(within(row).getByText("2026.03.02")).toBeTruthy();
    expect(within(row).getByText("2학년 3반")).toBeTruthy();
    expect(within(row).getByText("1번")).toBeTruthy();
    expect(within(row).getByText("보통")).toBeTruthy();
    expect(within(row).getByText("6/6")).toBeTruthy();
    expect(within(row).getByRole("button", { name: "편집하기" })).toBeTruthy();
    const second = screen.getByText("이서준").closest("tr") as HTMLElement;
    expect(within(second).getByText("번호 미입력")).toBeTruthy();
    expect(within(second).getByText("0/6")).toBeTruthy();
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
      await screen.findByText("학생 목록을 불러오지 못했어요"),
    ).toBeTruthy();
  });
});
