// 본사 대시보드 서버 호출이 apiFetch 를 거쳐 보는 사람의 시간대(X-Time-Zone)와 인증 헤더를 함께 싣는지 확인한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "tok",
}));

import { browserTimeZone } from "@/lib/time/zone";
import {
  fetchHqB2c,
  fetchHqSummary,
  fetchHqTenants,
  fetchHqTrends,
  fetchHqUsage,
  fetchLoginLog,
  fetchLoginStats,
} from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("hq-dashboard api 요청 헤더", () => {
  test.each([
    ["summary", () => fetchHqSummary(false), "/api/admin/hq-dashboard/summary"],
    ["tenants", () => fetchHqTenants(true), "/api/admin/hq-dashboard/tenants"],
    ["usage", () => fetchHqUsage(false), "/api/admin/hq-dashboard/usage"],
    [
      "logins stats",
      () => fetchLoginStats("view=stats"),
      "/api/admin/hq-dashboard/logins",
    ],
    [
      "logins log",
      () => fetchLoginLog("view=log"),
      "/api/admin/hq-dashboard/logins",
    ],
    [
      "trends",
      () => fetchHqTrends("from=2026-11-01"),
      "/api/admin/hq-dashboard/trends",
    ],
    ["b2c", () => fetchHqB2c("from=2026-11-01"), "/api/admin/hq-dashboard/b2c"],
  ])(
    "%s 요청은 인증 헤더와 X-Time-Zone 을 싣는다",
    async (_name, call, path) => {
      await call();

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url.startsWith(path)).toBe(true);
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer tok");
      expect(headers.get("X-Time-Zone")).toBe(browserTimeZone());
    },
  );
});
