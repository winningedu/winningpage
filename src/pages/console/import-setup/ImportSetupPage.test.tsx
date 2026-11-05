// W11 학생불러오기-일괄설정, W11a 확인 창. 화면에 보이는 글, 보낸 요청, 열린 창으로 검증한다.

import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("../useIdleLogout", () => ({ useIdleLogout: vi.fn() }));

import ConsoleGate from "../ConsoleGate";
import ConsoleLayout from "../ConsoleLayout";
import { type ApiHandler, adminMe, renderRoutes, stubApi } from "../testUtils";
import ImportSetupPage from "./ImportSetupPage";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [
      {
        Component: ConsoleLayout,
        children: [{ path: "import", Component: ImportSetupPage }],
      },
    ],
  },
];

const GROUPS = [
  { id: "g1", name: "A레벨", studentCount: 26 },
  { id: "g2", name: "C레벨", studentCount: 0 },
];

const YEAR = {
  schoolYear: 2026,
  toYear: 2027,
  rolledOver: false,
  gradeCounts: [
    { grade: "고1", count: 150 },
    { grade: "고2", count: 150 },
    { grade: "고3", count: 150 },
  ],
  graduatingGrades: ["고3"],
  lastRollover: null,
};

function stubImport(
  over: {
    groups?: unknown;
    year?: Partial<typeof YEAR>;
    extra?: Record<string, ApiHandler>;
  } = {},
) {
  return stubApi({
    "GET /api/console/me": { body: adminMe },
    "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
    "GET /api/console/groups": { body: { groups: over.groups ?? GROUPS } },
    "GET /api/console/school-year": { body: { ...YEAR, ...over.year } },
    ...over.extra,
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

describe("ImportSetupPage 머리와 그룹 목록", () => {
  it("제목, 부제, 등록된 그룹을 보여준다", async () => {
    stubImport();
    renderRoutes(routes, "/teacher/import");

    expect(
      await screen.findByRole("heading", { name: "학생불러오기-일괄설정" }),
    ).toBeTruthy();
    expect(
      screen.getByText("명단 엑셀 올리기, 학년그룹 일괄 변경, 그룹(레벨) 관리"),
    ).toBeTruthy();
    expect(await screen.findByText("A레벨")).toBeTruthy();
    expect(screen.getByText("C레벨")).toBeTruthy();
    // 휴대폰 부제와 구역 제목
    expect(screen.getAllByText("그룹(레벨) 관리")).toHaveLength(2);
    expect(
      screen.getByText(
        "명단 엑셀 올리기와 학년그룹 일괄 변경은 PC나 태블릿에서 할 수 있어요",
      ),
    ).toBeTruthy();
  });
});
