import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token-1",
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/time/zone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/time/zone")>()),
  browserTimeZone: () => "Asia/Seoul",
}));

import { fetchCalls, fetchCitations, fetchSummary } from "./api";

function stubFetch() {
  const fn = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true, items: [] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("AI 텔레메트리 요청 헤더", () => {
  test.each([
    ["summary", fetchSummary],
    ["calls", fetchCalls],
    ["citations", fetchCitations],
  ])("%s 요청은 X-Time-Zone 과 Authorization 을 싣는다", async (_n, run) => {
    const fn = stubFetch();
    await run("view=x&from=2026-10-01&to=2026-10-02");
    const init = fn.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Time-Zone")).toBe("Asia/Seoul");
    expect(headers.get("Authorization")).toBe("Bearer token-1");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
