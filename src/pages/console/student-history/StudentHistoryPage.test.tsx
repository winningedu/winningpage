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
afterEach(() => {
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
