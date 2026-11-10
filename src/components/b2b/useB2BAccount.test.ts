// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSignOut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signOut: mockSignOut } },
}));
vi.mock("@/context/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("../Header", () => ({
  fetchProfile: vi.fn(),
  getCsatDay: vi.fn(),
}));

import { signOutB2B } from "./useB2BAccount";

beforeEach(() => {
  localStorage.clear();
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue({ error: null });
});

describe("signOutB2B", () => {
  it("로그아웃하면 학습진단 초안만 모두 지운다", async () => {
    localStorage.setItem("diagnosis-draft:u1", "{}");
    localStorage.setItem("diagnosis-draft:u2", "{}");
    localStorage.setItem("other-key", "keep");

    await signOutB2B();

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
    expect(localStorage.getItem("diagnosis-draft:u2")).toBeNull();
    expect(localStorage.getItem("other-key")).toBe("keep");
  });
});
