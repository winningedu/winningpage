import "@testing-library/jest-dom/vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("./admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { toast } from "@/components/ui/toast";
import { AdminLayout } from "./Admin";
import { reportAdminError } from "./admin/shared/adminErrors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminLayout 토스트", () => {
  it("오류 안내가 관리자 셸 안에서 토스트로 보이고, 뷰포트는 한 번만 마운트된다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminLayout />
      </MemoryRouter>,
    );

    act(() => {
      reportAdminError("저장 실패", { message: "WC035" });
    });

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("저장 실패"),
    );
    expect(
      document.querySelectorAll('[data-slot="toast-viewport"]'),
    ).toHaveLength(1);
    toast.close();
  });
});
