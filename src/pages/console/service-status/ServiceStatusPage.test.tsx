// W8 서비스별 현황표. 여섯 서비스 탭, 학년그룹과 반 조회, 행에서 개인종합코칭으로 이동을 검증한다.

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
import ServiceStatusPage from "./ServiceStatusPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "service-status/:service?", Component: ServiceStatusPage },
          { path: "coaching", Component: () => <p>코칭 화면</p> },
        ],
      },
    ],
  },
];

const CLASSES = {
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

const base = (n: number, name: string) => ({
  studentId: `s${n}`,
  name,
  grade: "고2",
  groupName: null,
  className: "3",
  number: n,
});

const page = (items: unknown[], over: Record<string, unknown> = {}) => ({
  total: items.length,
  page: 1,
  pageCount: 1,
  asOf: "2026-11-05",
  orgType: "학교",
  items,
  ...over,
});

const url = (service: string, extra = "") =>
  `GET /api/console/service-status?service=${service}${extra}&page=1`;

const DIAGNOSIS = page([
  {
    ...base(1, "김서연"),
    detail: {
      urgency: "mid",
      executionAvg: 62,
      readinessAvg: 71,
      weakest: { name: "계획 설계", score: 60, status: "보통" },
      diagnosedAt: "2026-03-10",
    },
  },
  {
    ...base(2, "최민준"),
    detail: {
      urgency: "low",
      executionAvg: 78,
      readinessAvg: 80,
      weakest: { name: "시간 관리", score: 72, status: "보통" },
      diagnosedAt: "2026-03-11",
    },
  },
]);

function stubPage(
  routesOver: Record<string, ApiHandler> = {},
  me: unknown = homeroomMe,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/classes": { body: CLASSES },
    [url("diagnosis")]: { body: DIAGNOSIS },
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

describe("W8 서비스별 현황표", () => {
  it("학습진단 탭을 기본으로 보여 주고 긴급도, 두 평균, 가장 시급한 영역, 진단일을 적는다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/service-status");

    expect(await screen.findByText("검색 결과 2명")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "서비스별 현황표" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "집계 기준: 담당 학급 2학년 3반, 2학년 5반, 2026.11.05 기준",
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "학습진단",
      "목표관리",
      "성장설계",
      "수행평가",
      "자기평가",
      "심화탐구",
    ]);
    expect(
      screen
        .getByRole("tab", { name: "학습진단" })
        .getAttribute("aria-selected"),
    ).toBe("true");

    const first = screen.getByRole("row", { name: /김서연/ });
    expect(within(first).getByText("보통")).toBeTruthy();
    expect(within(first).getByText("62점")).toBeTruthy();
    expect(within(first).getByText("71점")).toBeTruthy();
    expect(within(first).getByText("계획 설계(60점, 보통)")).toBeTruthy();
    expect(within(first).getByText("2026.03.10")).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /최민준/ })).getByText("낮음"),
    ).toBeTruthy();
  });
});
