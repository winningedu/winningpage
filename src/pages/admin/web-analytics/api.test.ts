import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/time/zone", () => ({
  browserTimeZone: () => "Asia/Seoul",
  isValidTimeZone: () => true,
}));
vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { fetchWebAnalytics } from "./api";

const fetchMock = vi.fn(
  async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ ok: true }),
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWebAnalytics", () => {
  test("보는 사람 시간대 헤더와 인증 헤더를 함께 보낸다", async () => {
    await fetchWebAnalytics({ from: "2026-11-01", to: "2026-11-07" });

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Time-Zone")).toBe("Asia/Seoul");
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/admin/web-analytics?from=2026-11-01&to=2026-11-07",
    );
  });
});
