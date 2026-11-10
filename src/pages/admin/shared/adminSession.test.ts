// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: mocks } }));

import { getFreshSupabaseAccessTokenOrSignOut } from "./adminSession";

beforeEach(() => {
  localStorage.clear();
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: "a.b.c", expires_at: 1 } },
    error: null,
  });
  localStorage.setItem("diagnosis-draft:u1", "{}");
  localStorage.setItem("other-key", "keep");
});

describe("getFreshSupabaseAccessTokenOrSignOut", () => {
  it("토큰 갱신에 실패해 로그아웃하면 학습진단 초안만 지운다", async () => {
    mocks.refreshSession.mockResolvedValue({
      data: { session: null },
      error: new Error("refresh failed"),
    });

    await expect(getFreshSupabaseAccessTokenOrSignOut()).rejects.toThrow();

    expect(mocks.signOut).toHaveBeenCalled();
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
    expect(localStorage.getItem("other-key")).toBe("keep");
  });

  it("갱신한 토큰도 이미 만료돼 로그아웃하면 학습진단 초안만 지운다", async () => {
    const payload = btoa(JSON.stringify({ sub: "u", exp: 1 }));
    mocks.refreshSession.mockResolvedValue({
      data: { session: { access_token: `h.${payload}.s`, expires_at: 1 } },
      error: null,
    });

    await expect(getFreshSupabaseAccessTokenOrSignOut()).rejects.toThrow();

    expect(mocks.signOut).toHaveBeenCalled();
    expect(localStorage.getItem("diagnosis-draft:u1")).toBeNull();
    expect(localStorage.getItem("other-key")).toBe("keep");
  });
});
