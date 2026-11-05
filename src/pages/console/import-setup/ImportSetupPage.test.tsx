// W11 학생불러오기-일괄설정, W11a 확인 창. 화면에 보이는 글, 보낸 요청, 열린 창으로 검증한다.

import { fireEvent, screen, waitFor } from "@testing-library/react";
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

describe("ImportSetupPage 그룹 추가", () => {
  const GROUP_LABEL = "그룹(레벨이 구분되어 있으면 입력, 없으면 빈칸)";

  it("이름을 넣고 추가하면 요청을 보내고 칸을 비우며 목록에 새 그룹이 보인다", async () => {
    const groups = [...GROUPS];
    const calls = stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
      "GET /api/console/school-year": { body: YEAR },
      "GET /api/console/groups": () => ({ body: { groups } }),
      "POST /api/console/groups": () => {
        groups.push({ id: "g3", name: "B레벨", studentCount: 0 });
        return { body: { ok: true, groupId: "g3" } };
      },
    });
    renderRoutes(routes, "/teacher/import");

    const input = (await screen.findByLabelText(
      GROUP_LABEL,
    )) as HTMLInputElement;
    expect(
      (screen.getByRole("button", { name: "추가" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(input, { target: { value: "  B레벨 " } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(await screen.findByText("B레벨")).toBeTruthy();
    expect(
      calls.find((c) => c.key === "POST /api/console/groups")?.body,
    ).toEqual({ name: "B레벨" });
    expect(input.value).toBe("");
  });

  it("서버가 거절하면 서버 문구를 토스트로 보이고 입력을 남긴다", async () => {
    stubImport({
      extra: {
        "POST /api/console/groups": {
          status: 409,
          body: {
            error: {
              code: "GROUP_EXISTS",
              message: "이미 있는 그룹 이름이에요.",
            },
          },
        },
      },
    });
    renderRoutes(routes, "/teacher/import");

    const input = (await screen.findByLabelText(
      GROUP_LABEL,
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "A레벨" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(await screen.findByText("이미 있는 그룹 이름이에요.")).toBeTruthy();
    await waitFor(() => expect(input.value).toBe("A레벨"));
  });
});

describe("ImportSetupPage 그룹 삭제", () => {
  it("소속 학생이 없는 그룹은 확인 창에서 삭제하고 목록에서 빠진다", async () => {
    const groups = [...GROUPS];
    const calls = stubApi({
      "GET /api/console/me": { body: adminMe },
      "GET /api/console/enrollment-requests/count": { body: { count: 0 } },
      "GET /api/console/school-year": { body: YEAR },
      "GET /api/console/groups": () => ({ body: { groups } }),
      "POST /api/console/groups/delete": () => {
        groups.pop();
        return { body: { ok: true } };
      },
    });
    renderRoutes(routes, "/teacher/import");

    fireEvent.click(await screen.findByRole("button", { name: "C레벨 삭제" }));
    expect(await screen.findByText("C레벨 그룹을 삭제할까요?")).toBeTruthy();
    expect(
      screen.getByText(
        "소속 학생이 없는 그룹이에요. 삭제하면 학생정보편집, 담당학급배정, 필터의 보기에서 빠져요",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(screen.queryByText("C레벨")).toBeNull());
    expect(
      calls.find((c) => c.key === "POST /api/console/groups/delete")?.body,
    ).toEqual({ groupId: "g2" });
  });
});
