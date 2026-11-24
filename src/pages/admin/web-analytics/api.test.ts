import { beforeEach, describe, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/http/client", () => ({ api: { get: http.get } }));

import { type WebAnalyticsReport, webAnalyticsQueryOptions } from "./api";

const REPORT: WebAnalyticsReport = {
  range: { from: "2026-11-01", to: "2026-11-07" },
  totals: { pageviews: 1200, visitors: 340 },
  topPages: [{ path: "/", pageviews: 500, visitors: 200 }],
  events: [
    {
      name: "report_export",
      count: 9,
      visitors: 5,
      breakdowns: [
        { property: "method", values: [{ value: "pdf", count: 6 }] },
      ],
    },
  ],
};

const RANGE = { from: "2026-11-01", to: "2026-11-07" };

// queryFn 이 api.get 에 넘긴 경로, 검색 조건, signal 과 스키마 검증 결과를 읽는다.
async function runQuery(signal = new AbortController().signal) {
  const options = webAnalyticsQueryOptions(RANGE);
  const queryFn = options.queryFn as (ctx: {
    signal: AbortSignal;
  }) => Promise<unknown>;
  const result = await queryFn({ signal });
  const [path, init] = http.get.mock.calls[0] as [
    string,
    { searchParams: Record<string, string>; signal: AbortSignal },
  ];
  return { result, path, init };
}

beforeEach(() => {
  http.get.mockReset();
  http.get.mockReturnValue({
    json: async (schema: { parse: (value: unknown) => unknown }) =>
      schema.parse(REPORT),
  });
});

describe("webAnalyticsQueryOptions", () => {
  test("쿼리 키는 기간을 담는다", () => {
    expect(webAnalyticsQueryOptions(RANGE).queryKey).toEqual([
      "admin",
      "webAnalytics",
      "2026-11-01",
      "2026-11-07",
    ]);
  });

  test("기간을 검색 조건으로 보내고 query signal 을 넘긴다", async () => {
    const controller = new AbortController();

    const { path, init } = await runQuery(controller.signal);

    expect(path).toBe("admin/web-analytics");
    expect(init.searchParams).toEqual(RANGE);
    expect(init.signal).toBe(controller.signal);
  });

  test("서버 보고서를 스키마로 읽어 그대로 돌려준다", async () => {
    const { result } = await runQuery();

    expect(result).toEqual(REPORT);
  });

  test("모양이 다른 응답은 스키마 오류로 던진다", async () => {
    http.get.mockReturnValue({
      json: async (schema: { parse: (value: unknown) => unknown }) =>
        schema.parse({ ...REPORT, totals: { pageviews: "x" } }),
    });

    await expect(runQuery()).rejects.toThrow();
  });
});
