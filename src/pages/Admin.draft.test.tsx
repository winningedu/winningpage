import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

import { AdminLayout } from "./Admin";

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace: vi.fn() },
  });
});

describe("Admin 학습진단 초안", () => {
  it("관리자 로그아웃 버튼을 누르면 학습진단 초안을 지우고 다른 키는 둔다", async () => {
    localStorage.setItem("diagnosis-draft:u1", "{}");
    localStorage.setItem("other-key", "keep");
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminLayout />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => expect(window.location.replace).toHaveBeenCalled());
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
    expect(localStorage.getItem("other-key")).toBe("keep");
  });
});
