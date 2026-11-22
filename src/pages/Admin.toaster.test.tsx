import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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
import { toastWarning } from "./admin/shared/adminToast";
import { confirmAdmin } from "./admin/shared/confirmAdmin";

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

  it("닫아야 하는 경고가 5개 쌓여도 모두 보인다(기본 한도 3개로 숨기지 않는다)", async () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminLayout />
      </MemoryRouter>,
    );

    act(() => {
      for (let i = 1; i <= 5; i++) toastWarning(`경고 ${i}`);
    });

    await waitFor(() =>
      expect(document.querySelectorAll('[data-slot="toast"]')).toHaveLength(5),
    );
    expect(document.querySelectorAll("[data-limited]")).toHaveLength(0);
    toast.close();
  });

  it("확인창 호스트가 관리자 셸에 한 번만 마운트돼 confirmAdmin 이 뜬다", async () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminLayout />
      </MemoryRouter>,
    );

    let result: Promise<boolean> | undefined;
    act(() => {
      result = confirmAdmin({ title: "셸 확인창" });
    });

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "셸 확인창",
    );
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    screen.getByRole("button", { name: "취소" }).click();
    await expect(result).resolves.toBe(false);
  });
});
