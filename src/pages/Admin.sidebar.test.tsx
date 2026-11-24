import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  allowed: new Set<string>(["popups", "banners", "admissionGuidelines"]),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "u1" }),
}));

vi.mock("@/lib/http/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/http/client")>()),
  api: {
    get: () => ({
      json: async (schema: { parse: (v: unknown) => unknown }) =>
        schema.parse({
          permissions: Object.fromEntries(
            [...state.allowed].map((k) => [k, "edit"]),
          ),
          isSuper: false,
        }),
    }),
  },
}));

vi.mock("./admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { AdminLayout } from "./Admin";

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderShell(path = "/admin/banners") {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AdminLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      이동 {to}
    </button>
  );
}

function renderShellWithNav(path: string, to: string) {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <GoTo to={to} />
        <AdminLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.allowed = new Set(["popups", "banners", "admissionGuidelines"]);
});

describe("AdminSidebar 메뉴", () => {
  it("메뉴 항목은 링크이고 현재 섹션에만 aria-current 가 붙는다", async () => {
    renderShell("/admin/banners");

    const current = await screen.findByRole("link", { name: "메인 배너 관리" });
    const other = screen.getByRole("link", { name: "팝업 관리" });
    expect(current).toHaveAttribute("href", "/admin/banners");
    expect(other).toHaveAttribute("href", "/admin/popups");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(other).not.toHaveAttribute("aria-current");
  });

  it("그룹 토글은 aria-expanded 를 노출하고 누르면 접히고 펼쳐진다", async () => {
    renderShell("/admin/banners");

    const toggle = await screen.findByRole("button", { name: "메인화면 관리" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "팝업 관리" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "팝업 관리" })).toBeTruthy();
  });

  it("접근 권한이 없는 섹션은 링크로 그려지지 않는다", async () => {
    renderShell("/admin/banners");

    await screen.findByRole("link", { name: "팝업 관리" });
    expect(screen.queryByRole("link", { name: "합격생 대학 관리" })).toBeNull();
    expect(
      document.querySelector('a[href="/admin/universityAcceptances"]'),
    ).toBeNull();
  });

  it("현재 섹션이 속한 그룹이 펼쳐져 있고 그 안의 링크가 활성으로 표시된다", async () => {
    renderShell("/admin/admissionGuidelines");

    const toggle = await screen.findByRole("button", { name: "입시정보 관리" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      within(
        toggle.closest("[data-slot=sidebar-group]") as HTMLElement,
      ).getByRole("link", { name: "대입 모집 요강" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("처음에는 현재 섹션이 속한 그룹만 펼쳐져 있다", async () => {
    renderShell("/admin/banners");

    const current = await screen.findByRole("button", {
      name: "메인화면 관리",
    });
    const other = screen.getByRole("button", { name: "입시정보 관리" });
    expect(current).toHaveAttribute("aria-expanded", "true");
    expect(other).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "대입 모집 요강" })).toBeNull();
  });

  it("다른 그룹의 항목으로 이동하면 그 그룹을 추가로 펼치고 기존 그룹은 닫지 않는다", async () => {
    renderShellWithNav("/admin/banners", "/admin/admissionGuidelines");

    const first = await screen.findByRole("button", { name: "메인화면 관리" });
    const second = screen.getByRole("button", { name: "입시정보 관리" });
    expect(second).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: /^이동/ }));

    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveAttribute("aria-expanded", "true");
  });

  it("사용자가 접은 그룹은 같은 그룹 안에서 이동해도 접힌 채로 있다", async () => {
    renderShellWithNav("/admin/banners", "/admin/popups");

    const toggle = await screen.findByRole("button", { name: "메인화면 관리" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: /^이동/ }));

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("모두 펼치기를 누르면 모든 그룹이 열리고 라벨이 모두 접기로 바뀐다", async () => {
    renderShell("/admin/banners");

    const expandAll = await screen.findByRole("button", {
      name: "모두 펼치기",
    });
    const groups = ["메인화면 관리", "입시정보 관리"];

    fireEvent.click(expandAll);

    for (const name of groups) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }
    expect(screen.getByRole("button", { name: "모두 접기" })).toBeTruthy();
  });

  it("모두 접기를 누르면 모든 그룹이 닫히고 라벨이 모두 펼치기로 바뀐다", async () => {
    renderShell("/admin/banners");

    fireEvent.click(await screen.findByRole("button", { name: "모두 펼치기" }));
    fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));

    expect(
      screen.getByRole("button", { name: "메인화면 관리" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "입시정보 관리" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "모두 펼치기" })).toBeTruthy();
  });

  it("보이는 그룹이 없으면 모두 펼치기 버튼도 그리지 않는다", async () => {
    state.allowed = new Set();
    renderShell("/admin/banners");

    await screen.findByText("관리자");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByRole("button", { name: /^모두/ })).toBeNull();
  });

  it("통계 그룹에 대시보드와 방문 분석 링크가 있다", async () => {
    state.allowed = new Set(["hqDashboard", "webAnalytics"]);
    renderShell("/admin/hqDashboard");

    const toggle = await screen.findByRole("button", { name: "통계" });
    const group = toggle.closest("[data-slot=sidebar-group]") as HTMLElement;
    expect(
      within(group).getByRole("link", { name: "대시보드" }),
    ).toHaveAttribute("href", "/admin/hqDashboard");
    expect(
      within(group).getByRole("link", { name: "방문 분석" }),
    ).toHaveAttribute("href", "/admin/webAnalytics");
  });

  it("옛 메뉴 일일 입장과 이용 현황은 권한이 있어도 그리지 않는다", async () => {
    state.allowed = new Set(["members", "dailyEntries", "usageStatus"]);
    renderShell("/admin/members");

    await screen.findByRole("link", { name: "회원 목록" });
    expect(screen.queryByRole("link", { name: "일일 입장" })).toBeNull();
    expect(screen.queryByRole("link", { name: "이용 현황" })).toBeNull();
    expect(document.querySelector('a[href="/admin/dailyEntries"]')).toBeNull();
    expect(document.querySelector('a[href="/admin/usageStatus"]')).toBeNull();
  });

  it("Cmd+B 를 눌러도 사이드바는 그대로 있고 포커스된 요소의 keydown 핸들러가 먼저 실행된다", async () => {
    renderShell("/admin/banners");
    await screen.findByRole("link", { name: "팝업 관리" });

    const editor = document.createElement("div");
    editor.tabIndex = 0;
    const seen: string[] = [];
    editor.addEventListener("keydown", (e) => {
      seen.push(`own:${e.key}:${e.defaultPrevented}`);
    });
    document.querySelector("main")?.appendChild(editor);
    window.addEventListener("keydown", () => seen.push("window"), {
      once: true,
    });

    editor.focus();
    fireEvent.keyDown(editor, { key: "b", metaKey: true });

    expect(seen[0]).toBe("own:b:false");
    expect(screen.getByRole("link", { name: "팝업 관리" })).toBeVisible();
    expect(document.querySelector("aside")).toBeInTheDocument();
    expect(document.querySelector("[data-slot=sidebar]")).toBeInTheDocument();
  });
});
