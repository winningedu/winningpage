import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
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
});
