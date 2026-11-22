import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 어떤 체인이든 끝에서 await 하면 조회 오류가 나오는 가짜 supabase.
function failingChain() {
  const result = {
    data: null,
    count: null,
    error: { message: "permission denied for 홍길동", code: "42501" },
  };
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => failingChain(),
    rpc: () => failingChain(),
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

import { Toaster } from "@/components/ui/toast";
import { AdminSectionRoute } from "./Admin";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Admin 입결정보 엑셀 다운로드 오류 안내", () => {
  it("다운로드에 실패하면 원문 없이 안내만 토스트로 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/admin/admissionResults"]}>
        <AdminSectionRoute section="admissionResults" />
        <Toaster />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /엑셀 다운로드/ }),
    );

    await waitFor(() => {
      const titles = Array.from(
        document.querySelectorAll('[data-slot="toast-title"]'),
      ).map((node) => node.textContent);
      expect(titles).toContain("엑셀 다운로드 실패");
    });
    expect(document.body.textContent).not.toContain("홍길동");
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
