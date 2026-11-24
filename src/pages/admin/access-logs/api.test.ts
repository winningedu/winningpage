import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const zone = vi.hoisted(() => ({ value: "Asia/Seoul" }));
const http = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/time/zone", () => ({ browserTimeZone: () => zone.value }));
vi.mock("@/lib/http/client", () => ({ api: { get: http.get } }));

import { type AccessLogFilter, accessLogsQueryOptions } from "./api";

const PAGE = { items: [], page: 1, hasNext: false };

const base: AccessLogFilter = {
  tenantCode: "",
  from: "",
  to: "",
  kind: "",
  page: 1,
};

// queryFn 이 api.get 에 넘긴 검색 조건과 signal 을 읽는다.
async function runQuery(
  filter: AccessLogFilter,
  signal = new AbortController().signal,
) {
  const options = accessLogsQueryOptions(filter);
  const queryFn = options.queryFn as (ctx: {
    signal: AbortSignal;
  }) => Promise<unknown>;
  const result = await queryFn({ signal });
  const [path, init] = http.get.mock.calls[0] as [
    string,
    { searchParams: Record<string, string>; signal: AbortSignal },
  ];
  return { result, path, init, params: new URLSearchParams(init.searchParams) };
}

beforeEach(() => {
  zone.value = "Asia/Seoul";
  http.get.mockReset();
  http.get.mockReturnValue({
    json: async (schema: { parse: (value: unknown) => unknown }) =>
      schema.parse(PAGE),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("accessLogsQueryOptions", () => {
  test("조건이 같은 키를 쓰고 쪽이나 조건이 바뀌면 키가 바뀐다", () => {
    expect(accessLogsQueryOptions(base).queryKey).toEqual([
      "admin",
      "access-logs",
      base,
    ]);
    expect(accessLogsQueryOptions({ ...base, page: 2 }).queryKey).not.toEqual(
      accessLogsQueryOptions(base).queryKey,
    );
  });

  test("admin/access-logs 를 GET 하고 signal 을 넘기며 응답을 스키마로 읽는다", async () => {
    const signal = new AbortController().signal;

    const { result, path, init, params } = await runQuery(
      { ...base, tenantCode: "ABCD1234", kind: "edit", page: 3 },
      signal,
    );

    expect(path).toBe("admin/access-logs");
    expect(init.signal).toBe(signal);
    expect(params.get("tenantCode")).toBe("ABCD1234");
    expect(params.get("kind")).toBe("edit");
    expect(params.get("page")).toBe("3");
    expect(result).toEqual(PAGE);
  });

  test("서버 응답이 계약과 다르면 스키마 검증에서 던진다", async () => {
    http.get.mockReturnValue({
      json: async (schema: { parse: (value: unknown) => unknown }) =>
        schema.parse({ logs: [], page: 1, hasNext: false }),
    });

    await expect(runQuery(base)).rejects.toThrow();
  });
});

describe("accessLogsQueryOptions 기간", () => {
  test("브라우저가 서울이면 날짜를 서울 하루 경계의 ISO Z 시각으로 보낸다", async () => {
    const { params } = await runQuery({
      ...base,
      from: "2026-11-01",
      to: "2026-11-05",
    });

    expect(params.get("from")).toBe("2026-10-31T15:00:00.000Z");
    expect(params.get("to")).toBe("2026-11-05T15:00:00.000Z");
  });

  test("브라우저가 로스앤젤레스면 그 시간대의 경계를 보낸다", async () => {
    zone.value = "America/Los_Angeles";

    const { params } = await runQuery({
      ...base,
      from: "2026-11-01",
      to: "2026-11-05",
    });

    expect(params.get("from")).toBe("2026-11-01T07:00:00.000Z");
    expect(params.get("to")).toBe("2026-11-06T08:00:00.000Z");
  });

  test("날짜를 비우면 그 쪽 파라미터를 보내지 않는다", async () => {
    const { params } = await runQuery(base);

    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
  });
});
