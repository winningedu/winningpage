// W5 대시보드. 담당 범위의 서비스 이용 학생, 목표시간 달성율, 서비스별 이용현황과 상태(empty, loading, error, proxy)를 검증한다.

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
  adminMe,
  homeroomMe,
  proxyMe,
  renderRoutes,
  stubApi,
} from "../testUtils";
import DashboardPage from "./DashboardPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [{ index: true, Component: DashboardPage }],
      },
    ],
  },
];

const stats = (over: Record<string, unknown> = {}) => ({
  asOf: "2026-11-02",
  usage: { usingCount: 24, totalCount: 28 },
  goal: { userCount: 18, average: 61, buckets: { low: 3, mid: 9, high: 6 } },
  services: [
    { key: "diagnosis", count: 23 },
    { key: "goal", count: 18 },
    { key: "growth", count: 9 },
    { key: "performance", count: 13 },
    { key: "selfeval", count: 8 },
    { key: "inquiry", count: 6 },
  ],
  ...over,
});

const CLASSES = [
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
];

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DashboardPage", () => {
  it("담임은 주 담당 학급 범위의 집계 기준, 이용 학생, 달성율 3단계, 서비스별 인원을 본다", async () => {
    const calls = stubApi({
      "GET /api/console/me": { body: homeroomMe },
      "GET /api/console/classes": { body: { classes: CLASSES } },
      "GET /api/console/dashboard?grade=%EA%B3%A02&classId=c3": {
        body: stats(),
      },
    });

    renderRoutes(routes, "/teacher");

    expect(
      await screen.findByRole("heading", { level: 1, name: "대시보드" }),
    ).toBeTruthy();
    expect(
      screen.getByText("오늘의 학생 현황을 한눈에 확인하세요."),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        "집계 기준: 담당 학급 2학년 3반, 2026.11.02 기준",
      ),
    ).toBeTruthy();
    expect(screen.getByText("86%")).toBeTruthy();
    expect(screen.getByText("/ 28명")).toBeTruthy();
    expect(
      screen.getByText("이용 비율 86%. 서비스를 1개 이상 이용하는 학생"),
    ).toBeTruthy();
    expect(screen.getByText("평균 61%")).toBeTruthy();
    expect(screen.getByText("목표관리 이용 18명")).toBeTruthy();
    expect(screen.getByText("이용 학생의 17%")).toBeTruthy();
    expect(screen.getByText("이용 학생의 50%")).toBeTruthy();
    expect(screen.getByText("이용 학생의 33%")).toBeTruthy();
    const service = screen.getByText("학습진단").closest("li") as HTMLElement;
    expect(within(service).getByText("82%")).toBeTruthy();
    expect(within(service).getByText("23명")).toBeTruthy();
    expect(
      calls.some((c) => c.key.startsWith("GET /api/console/dashboard")),
    ).toBe(true);
  });
});
