// GET /api/admin/web-analytics 계약 검증. Vercel Web Analytics 조회 API 를 서버에서 불러
// 방문 합계, 많이 본 페이지, 이벤트 10개 횟수와 속성별 나눔을 돌려준다. fetch 는 가짜로 바꾼다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

type Handler = typeof import("./web-analytics.js")["default"];
let handler: Handler;

const TOKEN = "vercel-secret-token";
const ENV = {
  VERCEL_ANALYTICS_TOKEN: TOKEN,
  VERCEL_ANALYTICS_PROJECT_ID: "prj_site",
  VERCEL_ANALYTICS_TEAM_ID: "team_site",
};

const get = (query: Record<string, string>) =>
  callHandler(handler, undefined, "GET", query);

const RANGE = { from: "2026-11-01", to: "2026-11-07" };

interface Body {
  ok: boolean;
  range: { from: string; to: string };
  totals: { pageviews: number; visitors: number };
  topPages: { path: string; pageviews: number; visitors: number }[];
  events: {
    name: string;
    count: number;
    visitors: number;
    breakdowns: {
      property: string;
      values: { value: string; count: number }[];
    }[];
  }[];
  error?: { message: string; code: string };
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ version: 1, query: {}, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// 경로와 by 값으로 가짜 응답을 고른다.
function vercelFake(url: URL): Response {
  const by = url.searchParams.getAll("by");
  if (url.pathname.endsWith("/visits/count")) {
    return ok({ pageviews: 1200, visitors: 340 });
  }
  if (url.pathname.endsWith("/visits/aggregate")) {
    return ok([
      { requestPath: "/", pageviews: 500, visitors: 200 },
      { requestPath: "/services/growth", pageviews: 120, visitors: 60 },
    ]);
  }
  if (url.pathname.endsWith("/events/aggregate") && by.length === 1) {
    return ok([
      { eventName: "report_export", count: 9, visitors: 5 },
      { eventName: "signup_complete", count: 4, visitors: 4 },
    ]);
  }
  if (by[1] === "eventData/service") {
    return ok([{ eventName: "report_export", eventData: "growth", count: 7 }]);
  }
  if (by[1] === "eventData/method") {
    return ok([
      { eventName: "report_export", eventData: "pdf", count: 6 },
      { eventName: "report_export", eventData: "copy", count: 3 },
    ]);
  }
  if (by[1] === "eventData/member_type") {
    return ok([
      { eventName: "signup_complete", eventData: "student", count: 4 },
    ]);
  }
  return ok([]);
}

const fetchMock = vi.fn(
  async (input: string | URL | Request, _init?: RequestInit) =>
    vercelFake(new URL(String(input))),
);

beforeEach(async () => {
  vi.resetModules();
  handler = (await import("./web-analytics.js")).default;
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "webAnalytics", level: "view" }],
    error: null,
  });
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/admin/web-analytics", () => {
  test("방문 분석 보기 권한이 없으면 403 이고 Vercel 을 부르지 않는다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [{ resource_key: "webAnalytics", level: "none" }],
      error: null,
    });

    const r = await get(RANGE);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ["VERCEL_ANALYTICS_TOKEN"],
    ["VERCEL_ANALYTICS_PROJECT_ID"],
    ["VERCEL_ANALYTICS_TEAM_ID"],
  ])("%s 가 없으면 503 방문 분석 설정이 없어요", async (key) => {
    vi.stubEnv(key, "");

    const r = await get(RANGE);

    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({
      error: { code: "NOT_CONFIGURED", message: "방문 분석 설정이 없어요" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    [{}],
    [{ from: "2026-11-01" }],
    [{ from: "2026-11-31", to: "2026-12-01" }],
    [{ from: "2026-11-08", to: "2026-11-07" }],
    [{ from: "20261101", to: "2026-11-07" }],
  ])("기간이 틀리면 400 이다 %o", async (query) => {
    const r = await get(query as Record<string, string>);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("방문 합계, 많이 본 페이지, 이벤트 10개와 속성별 나눔을 돌려준다", async () => {
    const r = await get(RANGE);

    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const body = r.body as Body;
    expect(body.range).toEqual(RANGE);
    expect(body.totals).toEqual({ pageviews: 1200, visitors: 340 });
    expect(body.topPages).toEqual([
      { path: "/", pageviews: 500, visitors: 200 },
      { path: "/services/growth", pageviews: 120, visitors: 60 },
    ]);
    expect(body.events.map((e) => e.name)).toEqual([
      "signup_complete",
      "service_start",
      "diagnosis_complete",
      "checkout_start",
      "payment_complete",
      "consult_apply",
      "kakao_inquiry_click",
      "report_export",
      "paywall_cta_click",
      "ai_regenerate",
    ]);
    const report = body.events.find((e) => e.name === "report_export");
    expect(report).toEqual({
      name: "report_export",
      count: 9,
      visitors: 5,
      breakdowns: [
        { property: "service", values: [{ value: "growth", count: 7 }] },
        {
          property: "method",
          values: [
            { value: "pdf", count: 6 },
            { value: "copy", count: 3 },
          ],
        },
      ],
    });
    expect(body.events.find((e) => e.name === "signup_complete")).toEqual({
      name: "signup_complete",
      count: 4,
      visitors: 4,
      breakdowns: [
        {
          property: "member_type",
          values: [{ value: "student", count: 4 }],
        },
      ],
    });
    // 기록이 없는 이벤트도 0 으로 보이고, 속성 없는 이벤트는 나눔이 비어 있다.
    expect(body.events.find((e) => e.name === "consult_apply")).toEqual({
      name: "consult_apply",
      count: 0,
      visitors: 0,
      breakdowns: [],
    });
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);
  });

  test("Vercel 에는 Bearer 토큰, 프로젝트, 팀, 한국 날짜 경계를 보낸다", async () => {
    await get(RANGE);

    expect(fetchMock).toHaveBeenCalled();
    for (const call of fetchMock.mock.calls) {
      const url = new URL(String(call[0]));
      const init = call[1] as RequestInit;
      expect(url.origin).toBe("https://api.vercel.com");
      expect(url.pathname.startsWith("/v1/query/web-analytics/")).toBe(true);
      expect(url.searchParams.get("projectId")).toBe("prj_site");
      expect(url.searchParams.get("teamId")).toBe("team_site");
      expect(url.searchParams.get("since")).toBe(
        String(Date.parse("2026-11-01T00:00:00+09:00")),
      );
      expect(url.searchParams.get("until")).toBe(
        String(Date.parse("2026-11-08T00:00:00+09:00") - 1),
      );
      expect(new Headers(init.headers).get("Authorization")).toBe(
        `Bearer ${TOKEN}`,
      );
      expect(url.toString()).not.toContain(TOKEN);
    }
    const events = fetchMock.mock.calls
      .map((call) => new URL(String(call[0])))
      .find(
        (url) =>
          url.pathname.endsWith("/events/aggregate") &&
          url.searchParams.getAll("by").length === 1,
      );
    expect(events?.searchParams.get("filter")).toBe(
      "eventName in ('signup_complete','service_start','diagnosis_complete','checkout_start','payment_complete','consult_apply','kakao_inquiry_click','report_export','paywall_cta_click','ai_regenerate')",
    );
  });

  test("같은 사이트와 기간은 짧게 캐시해 Vercel 을 다시 부르지 않는다", async () => {
    await get(RANGE);
    const first = fetchMock.mock.calls.length;

    const again = await get(RANGE);

    expect(again.status).toBe(200);
    expect(fetchMock.mock.calls.length).toBe(first);

    await get({ from: "2026-11-02", to: "2026-11-07" });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(first);
  });

  test("Vercel 이 오류를 내면 502 이고 토큰을 싣지 않으며 캐시하지 않는다", async () => {
    fetchMock.mockImplementationOnce(
      async () => new Response("{}", { status: 403 }),
    );

    const r = await get(RANGE);

    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ error: { code: "UPSTREAM_ERROR" } });
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);

    fetchMock.mockClear();
    const retry = await get(RANGE);
    expect(retry.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  test("POST 는 405 다", async () => {
    const r = await callHandler(handler, undefined, "POST", RANGE);

    expect(r.status).toBe(405);
  });
});
