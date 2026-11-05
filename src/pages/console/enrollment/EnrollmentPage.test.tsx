// W7 이용현황. 반별 총원, 서비스별 이용 인원, 정원 입력, 집계 엑셀 출력을 검증한다.

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
import EnrollmentPage from "./EnrollmentPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "enrollment", Component: EnrollmentPage },
          { index: true, Component: () => <p>대시보드 화면</p> },
        ],
      },
    ],
  },
];

const SUMMARY_URL = "GET /api/console/enrollment/summary";

const services = (n: number[]) => ({
  diagnosis: n[0],
  goal: n[1],
  growth: n[2],
  performance: n[3],
  selfeval: n[4],
  inquiry: n[5],
});

const classRow = (over: Record<string, unknown> = {}) => ({
  classId: "c1",
  grade: "고1",
  groupName: null,
  className: "1",
  homeroomName: "김담임",
  total: 30,
  capacity: 32,
  joined: 28,
  services: services([28, 21, 9, 6, 3, 0]),
  goalRateAvg: 57,
  ...over,
});

const SCHOOL = {
  asOf: "2026-11-05",
  orgType: "학교",
  classes: [
    classRow(),
    classRow({
      classId: "c2",
      className: "2",
      homeroomName: null,
      total: 31,
      capacity: null,
      joined: 29,
      services: services([29, 10, 0, 0, 0, 0]),
      goalRateAvg: null,
    }),
  ],
};

function stubPage(
  over: Record<string, ApiHandler> = {},
  me: unknown = adminMe,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    [SUMMARY_URL]: { body: SCHOOL },
    ...over,
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

describe("W7 이용현황", () => {
  it("학교 전체 이용 학생 요약, 정원 기준 가입률, 반별 표를 보여 준다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/enrollment");

    expect(
      await screen.findByText("집계 기준: 학교 전체, 2026.11.05 기준"),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "이용현황" })).toBeTruthy();
    const donut = screen.getByRole("region", { name: "서비스 이용 학생" });
    expect(within(donut).getByText("57 / 61명")).toBeTruthy();
    expect(within(donut).getByText("93%")).toBeTruthy();
    expect(within(donut).getByText("학교 전체 가입률 94%")).toBeTruthy();
    expect(within(donut).getByText("정원 미입력 반 1개는 제외")).toBeTruthy();

    const first = screen.getByRole("row", { name: /김담임/ });
    expect(within(first).getByText("1학년")).toBeTruthy();
    expect(within(first).getByText("1반")).toBeTruthy();
    expect(within(first).getByText("30 / 32")).toBeTruthy();
    expect(within(first).getByText("28 / 30")).toBeTruthy();
    expect(within(first).getByText("28명 (93%)")).toBeTruthy();
    expect(within(first).getByText("57%")).toBeTruthy();

    const second = screen.getByRole("row", { name: /담임 미배정/ });
    expect(within(second).getByText("31")).toBeTruthy();
  });
});
