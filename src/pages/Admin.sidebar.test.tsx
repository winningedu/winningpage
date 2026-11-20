import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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

vi.mock("@/lib/adminPermissions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/adminPermissions")>()),
  fetchAdminPermissions: async () =>
    new Map([...state.allowed].map((k) => [k, "edit"])),
  fetchIsSuperAdmin: async () => false,
}));

vi.mock("./admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { AdminLayout } from "./Admin";

function renderShell(path = "/admin/banners") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdminLayout />
    </MemoryRouter>,
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

  it("모든 그룹이 처음부터 펼쳐져 있고 현재 섹션 링크가 활성으로 표시된다", async () => {
    renderShell("/admin/admissionGuidelines");

    const toggle = await screen.findByRole("button", { name: "입시정보 관리" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      within(
        toggle.closest("[data-slot=sidebar-group]") as HTMLElement,
      ).getByRole("link", { name: "대입 모집 요강" }),
    ).toHaveAttribute("aria-current", "page");
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
