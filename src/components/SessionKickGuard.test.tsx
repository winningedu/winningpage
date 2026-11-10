import "@testing-library/jest-dom/vitest";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionKickGuard from "./SessionKickGuard";

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "u1" }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: "kicked" }),
}));
vi.mock("@/lib/queryClient", () => ({
  sessionCheckQueryOptions: () => ({}),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signOut: async () => ({ error: null }) } },
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace: vi.fn() },
  });
});

describe("SessionKickGuard 학습진단 초안", () => {
  it("다른 기기 로그인으로 킥되면 학습진단 초안을 지우고 다른 키는 둔다", async () => {
    localStorage.setItem("diagnosis-draft:u1", "{}");
    localStorage.setItem("other-key", "keep");
    render(<SessionKickGuard />);

    await waitFor(() => expect(window.location.replace).toHaveBeenCalled());
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
    expect(localStorage.getItem("other-key")).toBe("keep");
  });
});
