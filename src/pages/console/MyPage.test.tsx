// W18 마이페이지. 내 정보 행과 비밀번호 변경 진입.

import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import ConsoleGate from "./ConsoleGate";
import MyPage from "./MyPage";
import { adminMe, homeroomMe, renderRoutes, stubApi } from "./testUtils";

const routes = [
  {
    path: "/teacher",
    Component: ConsoleGate,
    children: [{ path: "my", Component: MyPage }],
  },
];

function row(label: string) {
  const term = screen.getByText(label, { selector: "dt" });
  return (term.nextElementSibling as HTMLElement).textContent;
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

describe("MyPage", () => {
  it("담임교사의 아이디, 이름, 역할, 담당 범위(주 학급 표시)를 보여 준다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe } });

    renderRoutes(routes, "/teacher/my");

    expect(
      await screen.findByRole("heading", { level: 1, name: "마이페이지" }),
    ).toBeTruthy();
    expect(screen.getByText("내 정보와 설정")).toBeTruthy();
    expect(row("아이디")).toBe("SM26HB83K7MPQ2 (조회만, 수정 불가)");
    expect(row("이름")).toBe("박지훈");
    expect(row("역할")).toBe("담임교사");
    expect(row("담당 범위")).toBe("2학년 3반(주), 2학년 5반");
  });

  it("학교 전체 관리자는 역할이 학교 전체 관리자이고 담당 범위가 전교다", async () => {
    stubApi({ "GET /api/console/me": { body: adminMe } });

    renderRoutes(routes, "/teacher/my");

    await screen.findByRole("heading", { level: 1, name: "마이페이지" });
    expect(row("역할")).toBe("학교 전체 관리자");
    expect(row("담당 범위")).toBe("전교");
    expect(row("아이디")).toBe("SM26HB83R4TXW9 (조회만, 수정 불가)");
  });

  it("비밀번호 변경 버튼을 누르면 변경 창이 열린다", async () => {
    stubApi({ "GET /api/console/me": { body: homeroomMe } });
    renderRoutes(routes, "/teacher/my");

    fireEvent.click(
      await screen.findByRole("button", { name: "비밀번호 변경" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("비밀번호 변경")).toBeTruthy();
  });
});
