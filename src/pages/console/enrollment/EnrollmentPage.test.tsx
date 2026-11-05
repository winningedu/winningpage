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

  it("학년그룹을 고르면 요약과 표가 그 범위로 줄고, 반은 학년그룹을 고른 뒤에만 고를 수 있다", async () => {
    stubPage({
      [SUMMARY_URL]: {
        body: {
          ...SCHOOL,
          classes: [
            ...SCHOOL.classes,
            classRow({
              classId: "c3",
              grade: "고2",
              className: "1",
              homeroomName: "유담임",
              total: 20,
              capacity: null,
              joined: 10,
              services: services([10, 0, 0, 0, 0, 0]),
            }),
          ],
        },
      },
    });
    renderRoutes(routes, "/teacher/enrollment");
    await screen.findByText("유담임");
    const classSelect = screen.getByLabelText("반") as HTMLSelectElement;
    expect(classSelect.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "고2" },
    });

    expect(screen.queryByText("김담임")).toBeNull();
    expect(screen.getByText("유담임")).toBeTruthy();
    expect(
      await screen.findByText("집계 기준: 2학년, 2026.11.05 기준"),
    ).toBeTruthy();
    const donut = screen.getByRole("region", { name: "서비스 이용 학생" });
    expect(within(donut).getByText("10 / 20명")).toBeTruthy();
    expect(classSelect.disabled).toBe(false);
    expect(
      within(classSelect)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["전체", "1반"]);

    fireEvent.change(classSelect, { target: { value: "c3" } });
    expect(
      screen.getByText("집계 기준: 2학년 1반, 2026.11.05 기준"),
    ).toBeTruthy();
  });

  it("학원은 학년그룹을 학년 칸에 같이 적고 집계 기준을 학원 전체로 쓴다", async () => {
    stubPage({
      [SUMMARY_URL]: {
        body: {
          asOf: "2026-11-05",
          orgType: "학원",
          classes: [
            classRow({ groupName: "A레벨", homeroomName: "서지안" }),
            classRow({
              classId: "c9",
              groupName: null,
              className: "1",
              homeroomName: "이가은",
            }),
          ],
        },
      },
    });

    renderRoutes(routes, "/teacher/enrollment");

    expect(
      await screen.findByText("집계 기준: 학원 전체, 2026.11.05 기준"),
    ).toBeTruthy();
    const academy = screen.getByRole("row", { name: /서지안/ });
    expect(within(academy).getByText("1학년-A레벨")).toBeTruthy();
    const plain = screen.getByRole("row", { name: /이가은/ });
    expect(within(plain).getByText("1학년")).toBeTruthy();
  });

  it("조회 범위에 학생이 없으면 표 자리에 안내를 보이고 0명으로 요약한다", async () => {
    stubPage({
      [SUMMARY_URL]: {
        body: {
          ...SCHOOL,
          classes: [
            classRow({
              total: 0,
              joined: 0,
              capacity: null,
              services: services([0, 0, 0, 0, 0, 0]),
              goalRateAvg: null,
            }),
          ],
        },
      },
    });

    renderRoutes(routes, "/teacher/enrollment");

    expect(
      await screen.findByText(
        "조회 범위에 학생이 없어요. 학년그룹이나 반을 바꿔 보세요",
      ),
    ).toBeTruthy();
    const donut = screen.getByRole("region", { name: "서비스 이용 학생" });
    expect(within(donut).getByText("0 / 0명")).toBeTruthy();
    expect(screen.queryByRole("row", { name: /김담임/ })).toBeNull();
    expect(screen.getByText("총 1개 학급")).toBeTruthy();
  });
});
