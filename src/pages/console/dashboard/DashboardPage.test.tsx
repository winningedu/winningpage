// W5 대시보드. 담당 범위의 서비스 이용 학생, 목표시간 달성율, 서비스별 이용현황과 상태(empty, loading, error, proxy)를 검증한다.

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
  it("학교 관리자는 전교로 시작하고, 학년그룹을 고르기 전에는 반을 고를 수 없으며, 조회를 눌러야 범위가 바뀐다", async () => {
    const calls = stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/classes": { body: { classes: CLASSES } },
      "GET /api/console/dashboard": { body: stats() },
      "GET /api/console/dashboard?grade=%EA%B3%A02&classId=c5": {
        body: stats({ usage: { usingCount: 1, totalCount: 2 } }),
      },
    });

    renderRoutes(routes, "/teacher");

    expect(
      await screen.findByText("집계 기준: 전교, 2026.11.02 기준"),
    ).toBeTruthy();
    const classSelect = screen.getByLabelText("반") as HTMLSelectElement;
    expect(classSelect.disabled).toBe(true);
    expect(
      within(classSelect).getByText("학년그룹을 먼저 골라요"),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "고2" },
    });
    expect((screen.getByLabelText("반") as HTMLSelectElement).disabled).toBe(
      false,
    );
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "c5" } });
    expect(calls.some((c) => c.key.includes("classId=c5"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    expect(
      await screen.findByText("집계 기준: 2학년 5반, 2026.11.02 기준"),
    ).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("이용 학생이 없는 범위는 안내 문구와 달성율 카드의 '이용 학생 없음'을 보인다", async () => {
    stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/classes": { body: { classes: CLASSES } },
      "GET /api/console/dashboard": {
        body: stats({
          usage: { usingCount: 0, totalCount: 0 },
          goal: {
            userCount: 0,
            average: null,
            buckets: { low: 0, mid: 0, high: 0 },
          },
        }),
      },
    });

    renderRoutes(routes, "/teacher");

    expect(
      await screen.findByText(
        "연결된 학생이 없습니다. 학생들이 가입하면 자동으로 표시됩니다",
      ),
    ).toBeTruthy();
    expect(screen.getByText("이용 학생 없음")).toBeTruthy();
    expect(screen.queryByText(/^평균/)).toBeNull();
  });

  it("관리자가 거른 반에 학생이 없을 때는 가입 안내를 보이지 않는다", async () => {
    stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/classes": { body: { classes: CLASSES } },
      "GET /api/console/dashboard": { body: stats() },
      "GET /api/console/dashboard?grade=%EA%B3%A02&classId=c5": {
        body: stats({
          usage: { usingCount: 0, totalCount: 0 },
          goal: {
            userCount: 0,
            average: null,
            buckets: { low: 0, mid: 0, high: 0 },
          },
        }),
      },
    });

    renderRoutes(routes, "/teacher");
    await screen.findByText("집계 기준: 전교, 2026.11.02 기준");
    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "고2" },
    });
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "c5" } });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    expect(
      await screen.findByText("집계 기준: 2학년 5반, 2026.11.02 기준"),
    ).toBeTruthy();
    expect(screen.getByText("이용 학생 없음")).toBeTruthy();
    expect(screen.queryByText(/학생들이 가입하면/)).toBeNull();
  });

  it("집계를 불러오는 동안은 값 대신 뼈대를 보이고 끝나면 값으로 바뀐다", async () => {
    stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/classes": { body: { classes: CLASSES } },
      "GET /api/console/dashboard": { body: stats() },
    });

    renderRoutes(routes, "/teacher");

    const content = (await screen.findByText("서비스 이용 학생")).closest(
      "[aria-busy]",
    ) as HTMLElement;
    expect(content.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("86%")).toBeNull();
    expect(await screen.findByText("86%")).toBeTruthy();
    expect(content.getAttribute("aria-busy")).toBe("false");
  });

  it("집계를 읽지 못하면 오류 알림과 다시 시도 버튼을 보이고 값은 만들어 내지 않는다", async () => {
    stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/classes": { body: { classes: CLASSES } },
      "GET /api/console/dashboard": { status: 500, body: {} },
    });

    renderRoutes(routes, "/teacher");

    // 알림(토스트)과 화면 안 문구가 같은 문장이라 둘 다 보인다.
    await waitFor(() =>
      expect(
        screen.getAllByText(
          "대시보드를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
        ),
      ).toHaveLength(2),
    );
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.queryByText("서비스 이용 학생")).toBeNull();
  });

  it("본사 대행 중에는 학교 이름이 든 대행 띠를 대시보드 위에 보인다", async () => {
    stubApi({
      "GET /api/console/me": { body: proxyMe },
      "GET /api/console/classes": { body: { classes: CLASSES } },
      "GET /api/console/dashboard": { body: stats() },
    });

    renderRoutes(routes, "/teacher");

    expect(await screen.findByText("본사 대행 중: 한빛고등학교")).toBeTruthy();
    expect(await screen.findByText("86%")).toBeTruthy();
  });
});
