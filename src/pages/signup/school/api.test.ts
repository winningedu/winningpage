import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupTenant } from "./api";

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupTenant", () => {
  it("코드를 POST로 보내고 소속을 돌려받는다", async () => {
    const fetchMock = mockFetch(200, {
      tenantId: "t-1",
      name: "새빛중학교",
      orgType: "학교",
    });

    const result = await lookupTenant("ABCDEFGH");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/signup/tenant-lookup");
    expect(JSON.parse(String(init.body))).toEqual({ code: "ABCDEFGH" });
    expect(result).toEqual({
      ok: true,
      tenant: { id: "t-1", name: "새빛중학교", orgType: "학교" },
    });
  });

  it("없는 코드(404)는 not_found, 시도 초과(429)는 too_many로 구분한다", async () => {
    mockFetch(404, { code: "TENANT_NOT_FOUND" });
    expect(await lookupTenant("ABCDEFGH")).toEqual({
      ok: false,
      reason: "not_found",
    });

    mockFetch(429, { code: "WC068" });
    expect(await lookupTenant("ABCDEFGH")).toEqual({
      ok: false,
      reason: "too_many",
    });
  });

  it("네트워크 실패는 unknown이다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    expect(await lookupTenant("ABCDEFGH")).toEqual({
      ok: false,
      reason: "unknown",
    });
  });
});
