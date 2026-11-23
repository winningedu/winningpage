import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const zone = vi.hoisted(() => ({ value: "Asia/Seoul" }));

vi.mock("@/lib/time/zone", () => ({ browserTimeZone: () => zone.value }));
vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: async () => "token",
}));

import { fetchAccessLogs } from "./api";

const fetchMock = vi.fn(async (_input: string | URL | Request) =>
  Response.json({ ok: true, logs: [], page: 1, hasNext: false }),
);

const base = { tenantCode: "", from: "", to: "", kind: "" as const, page: 1 };

function requestedParams(): URLSearchParams {
  const url = String(fetchMock.mock.calls[0]?.[0]);
  return new URL(url, "http://localhost").searchParams;
}

beforeEach(() => {
  zone.value = "Asia/Seoul";
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAccessLogs 기간", () => {
  test("브라우저가 서울이면 날짜를 서울 하루 경계의 ISO Z 시각으로 보낸다", async () => {
    await fetchAccessLogs({ ...base, from: "2026-11-01", to: "2026-11-05" });

    const params = requestedParams();
    expect(params.get("from")).toBe("2026-10-31T15:00:00.000Z");
    expect(params.get("to")).toBe("2026-11-05T15:00:00.000Z");
  });

  test("브라우저가 로스앤젤레스면 그 시간대의 경계를 보낸다", async () => {
    zone.value = "America/Los_Angeles";

    await fetchAccessLogs({ ...base, from: "2026-11-01", to: "2026-11-05" });

    const params = requestedParams();
    expect(params.get("from")).toBe("2026-11-01T07:00:00.000Z");
    expect(params.get("to")).toBe("2026-11-06T08:00:00.000Z");
  });

  test("날짜를 비우면 그 쪽 파라미터를 보내지 않는다", async () => {
    await fetchAccessLogs(base);

    const params = requestedParams();
    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
  });
});
