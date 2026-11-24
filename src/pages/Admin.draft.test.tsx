import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: null }),
}));

vi.mock("./admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

const embed = vi.hoisted(() => ({ requestEmbedding: vi.fn() }));
vi.mock("./admin/engine/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin/engine/api")>()),
  requestEmbedding: embed.requestEmbedding,
}));

import { ApiError } from "@/lib/http/client";
import { AdminLayout, requestWinningEmbedding } from "./Admin";

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
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin"]}>
          <AdminLayout />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => expect(window.location.replace).toHaveBeenCalled());
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
    expect(localStorage.getItem("other-key")).toBe("keep");
  });

  it("임베딩 요청이 401이면 학습진단 초안을 지우고 다른 키는 둔다", async () => {
    localStorage.setItem("diagnosis-draft:u1", "{}");
    localStorage.setItem("other-key", "keep");
    embed.requestEmbedding.mockRejectedValue(
      new ApiError({
        status: 401,
        code: "UNAUTHORIZED",
        detail: "unauthorized",
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await requestWinningEmbedding({ id: "row-1" });

    expect(embed.requestEmbedding).toHaveBeenCalledWith("row-1");
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
    expect(localStorage.getItem("other-key")).toBe("keep");
    expect(console.error).toHaveBeenCalledWith(
      "위닝 수행 DB 자동 임베딩 요청 실패:",
      expect.objectContaining({
        message: "unauthorized: 로그아웃 후 다시 로그인하세요.",
      }),
    );
  });
});
