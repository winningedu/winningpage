import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hang: false }));

// 어떤 체인이든 끝에서 await 하면 빈 결과를 주고, hang 이면 끝내 풀리지 않는 가짜 supabase.
function chain() {
  const result = { data: [], count: 0, error: null };
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) => {
            if (!state.hang) resolve(result);
          };
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => chain(),
    rpc: () => chain(),
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

vi.mock("./admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { AdminSectionRoute } from "./Admin";

function renderSection(section: string) {
  return render(
    <MemoryRouter initialEntries={[`/admin/${section}`]}>
      <AdminSectionRoute section={section} />
    </MemoryRouter>,
  );
}

describe("Admin 섹션 셸", () => {
  it("config 탭은 링크로 렌더되고 현재 섹션 탭에만 aria-current 가 붙는다", async () => {
    state.hang = false;
    renderSection("admissionSusiJungsi");

    const nav = await screen.findByRole("navigation", { name: "섹션 탭" });
    const links = within(nav).getAllByRole("link");
    expect(links.length).toBeGreaterThan(1);
    const current = links.filter(
      (link) => link.getAttribute("aria-current") === "page",
    );
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/admin/admissionSusiJungsi");
  });

  it("불러오는 동안 로딩 문구가 role=status 안에 있다", async () => {
    state.hang = true;
    renderSection("banners");

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("데이터를 불러오는 중입니다.");
  });
});
