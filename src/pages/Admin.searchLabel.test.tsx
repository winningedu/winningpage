import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
}));

// 어떤 체인이든 끝에서 await 하면 state.rows 를 돌려주는 가짜 supabase.
function listChain() {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) =>
            resolve({
              data: state.rows,
              count: state.rows.length,
              error: null,
            });
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => listChain(),
    rpc: () => listChain(),
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

const gateApi = vi.hoisted(() => ({
  order: [] as string[],
}));

vi.mock("@/lib/adminAccessLog", () => ({
  verifyAdminPassword: vi.fn(async () => ({ ok: true })),
  writeAdminAccessLog: vi.fn(async () => {
    gateApi.order.push("log");
    return { ok: true };
  }),
}));

vi.mock("./admin/shared/csvExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/shared/csvExport")>()),
  downloadCsv: vi.fn(() => {
    gateApi.order.push("download");
  }),
}));

import { AdminSectionRoute } from "./Admin";

function renderSection() {
  return render(
    <MemoryRouter initialEntries={["/admin/premiumConsults"]}>
      <AdminSectionRoute section="premiumConsults" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("Admin 목록 툴바 접근성", () => {
  it("검색창은 보이는 라벨이 없어도 접근 가능한 이름을 가진다", async () => {
    state.rows = [];
    renderSection();

    const search = await screen.findByRole("textbox", { name: /검색|입력/ });
    expect(search.getAttribute("placeholder")).toBeTruthy();
  });
});
