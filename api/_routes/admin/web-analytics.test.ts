// GET /api/admin/web-analytics 계약 검증. Vercel Web Analytics 조회 API 를 서버에서 불러
// 방문 합계, 많이 본 페이지, 이벤트 10개 횟수와 속성별 나눔을 돌려준다. fetch 는 가짜로 바꾼다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { webAnalyticsReportSchema } from "../../../shared/web-analytics/contract.js";
import {
  callRoute,
  createAdminFake,
  problemCode,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  // report.ts 가 env 를 이 함수로 읽으므로 stubEnv 값을 그대로 돌려준다. SITE 만 고정한다.
  getEnv: (key: string) => (key === "SITE" ? "winning" : process.env[key]),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

// 보고서 캐시가 모듈 안에 있어 테스트마다 앱을 새로 불러온다.
type Handler = {
  app: Awaited<typeof import("../app.js")>["app"];
  path: string;
};
let handler: Handler;

const TOKEN = "vercel-secret-token";
const ENV = {
  VERCEL_ANALYTICS_TOKEN: TOKEN,
  VERCEL_ANALYTICS_PROJECT_ID: "prj_site",
  VERCEL_ANALYTICS_TEAM_ID: "team_site",
};

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "webAnalytics", level }] : [],
  });
}

const get = (
  query: Record<string, string>,
  zone: string | null = "Asia/Seoul",
) =>
  callRoute(handler, {
    query,
    headers: zone ? { "x-time-zone": zone } : {},
  });

const RANGE = { from: "2026-11-01", to: "2026-11-07" };

interface Body {
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
  // 실제 응답: visits/count 는 날짜 단위로 내림해 합계가 틀려 쓰지 않고, environment 로 나눈 집계를 합산한다.
  if (url.pathname.endsWith("/visits/aggregate") && by[0] === "environment") {
    return ok([{ environment: "production", visitors: 340, pageviews: 1200 }]);
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
  if (by[1] === "eventData/location") {
    return ok([
      {
        eventName: "kakao_inquiry_click",
        "eventData/location": "footer",
        visitors: 1,
        count: 1,
      },
    ]);
  }
  if (by[1] === "eventData/service") {
    return ok([
      { eventName: "report_export", "eventData/service": "growth", count: 7 },
    ]);
  }
  if (by[1] === "eventData/method") {
    return ok([
      { eventName: "report_export", "eventData/method": "pdf", count: 6 },
      { eventName: "report_export", "eventData/method": "copy", count: 3 },
    ]);
  }
  if (by[1] === "eventData/member_type") {
    return ok([
      {
        eventName: "signup_complete",
        "eventData/member_type": "student",
        count: 4,
      },
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
  handler = {
    app: (await import("../app.js")).app,
    path: "/api/admin/web-analytics",
  };
  setup("view");
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
  test.each([["view"], ["edit"]])(
    "방문 분석 %s 권한이면 200 이다",
    async (level) => {
      setup(level);

      const r = await get(RANGE);

      expect(r.status).toBe(200);
    },
  );

  test("방문 분석 권한이 없으면 403 FORBIDDEN 이고 Vercel 을 부르지 않는다", async () => {
    setup("none");

    const r = await get(RANGE);

    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("권한 행이 없어도 403 FORBIDDEN 이다", async () => {
    setup(null);

    const r = await get(RANGE);

    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test.each([
    ["VERCEL_ANALYTICS_TOKEN"],
    ["VERCEL_ANALYTICS_PROJECT_ID"],
    ["VERCEL_ANALYTICS_TEAM_ID"],
  ])("%s 가 없으면 503 방문 분석 설정이 없어요", async (key) => {
    vi.stubEnv(key, "");

    const r = await get(RANGE);

    expect(r.status).toBe(503);
    expect(problemCode(r.body)).toBe("NOT_CONFIGURED");
    expect(r.body).toMatchObject({ detail: "방문 분석 설정이 없어요" });
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
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("방문 합계, 많이 본 페이지, 이벤트 10개와 속성별 나눔을 돌려준다", async () => {
    const r = await get(RANGE);

    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(webAnalyticsReportSchema.safeParse(r.body).success).toBe(true);
    const body = r.body as Body;
    expect(body).not.toHaveProperty("ok");
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

  test("속성 나눔 값은 실제 응답의 eventData/<속성> 키에서 읽는다", async () => {
    const r = await get(RANGE);

    const kakao = (r.body as Body).events.find(
      (e) => e.name === "kakao_inquiry_click",
    );
    expect(kakao?.breakdowns).toEqual([
      { property: "location", values: [{ value: "footer", count: 1 }] },
    ]);
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

  test("서울 기간 2026-11-01..2026-11-30 은 since 2026-10-31T15:00:00Z until 2026-11-30T14:59:59.999Z 로 묻는다", async () => {
    await get({ from: "2026-11-01", to: "2026-11-30" });

    for (const call of fetchMock.mock.calls) {
      const url = new URL(String(call[0]));
      expect(url.searchParams.get("since")).toBe(
        String(Date.parse("2026-10-31T15:00:00Z")),
      );
      expect(url.searchParams.get("until")).toBe(
        String(Date.parse("2026-11-30T15:00:00Z") - 1),
      );
    }
  });

  test("로스앤젤레스 기간은 같은 날짜라도 그 시간대의 하루 경계로 묻는다", async () => {
    await get({ from: "2026-11-01", to: "2026-11-30" }, "America/Los_Angeles");

    for (const call of fetchMock.mock.calls) {
      const url = new URL(String(call[0]));
      // 11월 1일은 PDT(-07:00), 12월 1일은 PST(-08:00)
      expect(url.searchParams.get("since")).toBe(
        String(Date.parse("2026-11-01T07:00:00Z")),
      );
      expect(url.searchParams.get("until")).toBe(
        String(Date.parse("2026-12-01T08:00:00Z") - 1),
      );
    }
  });

  test("X-Time-Zone 헤더가 없으면 400 TIME_ZONE_REQUIRED 이고 Vercel 을 부르지 않는다", async () => {
    const r = await get(RANGE, null);

    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("TIME_ZONE_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("합계는 visits/count 대신 visits/aggregate by=environment 를 같은 기간으로 부른다", async () => {
    await get(RANGE);

    const urls = fetchMock.mock.calls.map((call) => new URL(String(call[0])));
    expect(urls.some((u) => u.pathname.endsWith("/visits/count"))).toBe(false);
    const totals = urls.find(
      (u) =>
        u.pathname.endsWith("/visits/aggregate") &&
        u.searchParams.getAll("by").join() === "environment",
    );
    expect(totals?.searchParams.get("since")).toBe(
      String(Date.parse("2026-11-01T00:00:00+09:00")),
    );
    expect(totals?.searchParams.get("until")).toBe(
      String(Date.parse("2026-11-08T00:00:00+09:00") - 1),
    );
  });

  test("합계 행이 없으면 0 이고 environment 행이 여럿이면 더한다", async () => {
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get("by") === "environment") {
        return ok(
          url.searchParams.get("since") ===
            String(Date.parse("2026-11-02T00:00:00+09:00"))
            ? []
            : [
                { environment: "production", visitors: 1, pageviews: 2 },
                { environment: "preview", visitors: 3, pageviews: 4 },
              ],
        );
      }
      return ok([]);
    });

    const sum = await get(RANGE);
    const empty = await get({ from: "2026-11-02", to: "2026-11-07" });

    expect((sum.body as Body).totals).toEqual({ pageviews: 6, visitors: 4 });
    expect((empty.body as Body).totals).toEqual({ pageviews: 0, visitors: 0 });
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
    expect(problemCode(r.body)).toBe("UPSTREAM_ERROR");
    expect(r.body).toMatchObject({
      detail: "방문 분석을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    });
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);

    fetchMock.mockClear();
    const retry = await get(RANGE);
    expect(retry.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  test("POST 는 405 다", async () => {
    const r = await callRoute(handler, { method: "POST", query: RANGE });

    expect(r.status).toBe(405);
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
    expect(r.headers.allow).toBe("GET, HEAD");
  });
});
