import { afterEach, describe, expect, test, vi } from "vitest";
import { apiFetch } from "./apiFetch";
import { browserTimeZone } from "./time/zone";

function stubFetch() {
  const spy = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", spy);
  return spy;
}

function sentHeaders(spy: ReturnType<typeof stubFetch>): Headers {
  const calls = spy.mock.calls as unknown as [unknown, RequestInit][];
  return new Headers(calls[0][1].headers);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch X-Time-Zone", () => {
  test("브라우저 시간대를 X-Time-Zone 으로 보낸다", async () => {
    const spy = stubFetch();

    await apiFetch("/api/x");

    expect(sentHeaders(spy).get("X-Time-Zone")).toBe(browserTimeZone());
  });

  test("호출부가 정한 X-Time-Zone 이 우선한다", async () => {
    const spy = stubFetch();

    await apiFetch("/api/x", {
      headers: { "x-time-zone": "America/Los_Angeles" },
    });

    expect(sentHeaders(spy).get("X-Time-Zone")).toBe("America/Los_Angeles");
  });

  test.each([
    ["plain object", () => ({ Authorization: "Bearer t" })],
    ["Headers", () => new Headers({ Authorization: "Bearer t" })],
    ["array", () => [["Authorization", "Bearer t"]] as [string, string][]],
  ])("%s 헤더도 다른 헤더를 유지하며 시간대를 붙인다", async (_n, make) => {
    const spy = stubFetch();

    await apiFetch("/api/x", { headers: make() });

    const headers = sentHeaders(spy);
    expect(headers.get("Authorization")).toBe("Bearer t");
    expect(headers.get("X-Time-Zone")).toBe(browserTimeZone());
  });

  test("호출부가 Headers 로 정한 X-Time-Zone 도 우선한다", async () => {
    const spy = stubFetch();

    await apiFetch("/api/x", {
      headers: new Headers({ "X-Time-Zone": "Asia/Tokyo" }),
    });

    expect(sentHeaders(spy).get("X-Time-Zone")).toBe("Asia/Tokyo");
  });
});
