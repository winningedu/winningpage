// W10 입시 상담코칭. 중3, 고3 학생 표, 학년그룹과 그룹과 반 조회, 코칭 이동, 3학년이 없는 상태를 검증한다.
// 상담 상태와 변경 일자 열은 counsel_statuses 테이블이 없어 그리지 않는다.

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
import AdmissionCoachingPage from "./AdmissionCoachingPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [
          { path: "admission-coaching", Component: AdmissionCoachingPage },
          { path: "coaching", Component: () => <p>코칭 화면</p> },
        ],
      },
    ],
  },
];

const classOf = (id: string, grade: string, name: string) => ({
  id,
  grade,
  groupId: null,
  groupName: null,
  name,
  hasHomeroom: true,
});

const CLASSES = {
  classes: [
    classOf("c1", "고2", "1"),
    classOf("c3", "고3", "3"),
    classOf("c4", "고3", "4"),
  ],
};

const student = (
  n: number,
  name: string,
  over: Record<string, unknown> = {},
) => ({
  studentId: `s${n}`,
  name,
  grade: "고3",
  groupName: null,
  className: "3",
  number: n,
  idealTarget: null,
  minTarget: null,
  execScore: null,
  urgency: null,
  ...over,
});

const body = (items: unknown[], over: Record<string, unknown> = {}) => ({
  total: items.length,
  page: 1,
  pageCount: 1,
  hasGrade3InScope: true,
  items,
  ...over,
});

const LIST_URL = "GET /api/console/admission-coaching?page=1";

const LIST = body([
  student(1, "정민서", {
    idealTarget: { university: "가나대", department: "경영학과" },
    minTarget: { university: "다라대", department: "경영학과" },
    execScore: 62,
    urgency: "mid",
  }),
  student(2, "한예준"),
]);

function stubPage(
  routesOver: Record<string, ApiHandler> = {},
  me: unknown = homeroomMe,
) {
  return stubApi({
    "GET /api/console/me": { body: me },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/classes": { body: CLASSES },
    [LIST_URL]: { body: LIST },
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

describe("W10 입시 상담코칭", () => {
  it("3학년 학생의 목표대학, 학습 실행 역량, 긴급도를 표로 보이고 값이 없으면 미가입, 미진단, 줄표로 적는다", async () => {
    stubPage();

    renderRoutes(routes, "/teacher/admission-coaching");

    expect(await screen.findByText("조회 결과 2명")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "입시 상담코칭" })).toBeTruthy();
    expect(
      screen.getByText(
        "입시를 앞둔 중3과 고3 학생의 목표와 진단 현황을 확인합니다",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("상담 메모는 개인종합코칭의 교사 메모에 써 주세요"),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual([
      "학생",
      "학년그룹/반",
      "이상 목표대학",
      "최소 목표대학",
      "학습 실행 역량",
      "학습진단 긴급도",
      "코칭",
    ]);

    const first = screen.getByRole("row", { name: /정민서/ });
    expect(within(first).getByText("3학년/3반")).toBeTruthy();
    expect(within(first).getByText("가나대 경영학과")).toBeTruthy();
    expect(within(first).getByText("다라대 경영학과")).toBeTruthy();
    expect(within(first).getByText("62점")).toBeTruthy();
    expect(within(first).getByText("보통")).toBeTruthy();

    const empty = screen.getByRole("row", { name: /한예준/ });
    expect(within(empty).getAllByText("미가입")).toHaveLength(2);
    expect(within(empty).getByText("미진단")).toBeTruthy();
    expect(within(empty).getByText("-")).toBeTruthy();
  });
});
