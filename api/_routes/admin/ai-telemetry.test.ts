// GET /api/admin/ai-telemetry 계약 검증. view 별 쿼리 인자, 권한, 입력 검증.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  callsOf,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./ai-telemetry.js";

const ZONE = "Asia/Seoul";
// 서울 2026-10-01 00:00 부터 2026-10-03 00:00 까지(to 포함이라 10-02 끝)
const FROM_UTC = "2026-09-30T15:00:00.000Z";
const TO_UTC = "2026-10-02T15:00:00.000Z";

let settings: Respond;
let calls: Respond;
let rpcs: Record<string, (args: Record<string, unknown>) => unknown>;

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "aiTelemetry", level }] : [],
    tables: {
      app_settings: (query) => settings(query),
      ai_model_calls: (query) => calls(query),
    },
    rpcs: new Proxy(
      {},
      {
        get: (_t, name) => (args: Record<string, unknown>) =>
          (rpcs[String(name)] ?? (() => ({ data: [], error: null })))(args),
      },
    ) as never,
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const get = (query: Record<string, string> = {}, zone = ZONE) =>
  callRoute(
    (req, res) => {
      if (zone) req.headers["x-time-zone"] = zone;
      return handler(req, res);
    },
    { query },
  );

beforeEach(() => {
  settings = () => ({ data: null, error: null });
  calls = () => ({ data: [], error: null, count: 0 });
  rpcs = {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("권한", () => {
  test("view 권한이면 읽을 수 있다", async () => {
    setup("view");
    expect((await get({ view: "pricing" })).status).toBe(200);
  });

  test("권한 행이 없으면 403 이고 읽지 않는다", async () => {
    const admin = setup(null);
    const r = await get({ view: "pricing" });
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(admin.queries.some((q) => q.table === "app_settings")).toBe(false);
  });
});

describe("view=summary", () => {
  test("ok 없는 본문으로 구간, 합계, 단가 설정 여부를 돌려준다", async () => {
    const admin = setup();
    const r = await get({ from: "2026-10-01", to: "2026-10-02" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      from: FROM_UTC,
      to: TO_UTC,
      items: [],
      pricingConfigured: false,
    });
    expect(r.body).not.toHaveProperty("ok");
    expect(r.body).toHaveProperty("totals");
    expect(admin.rpcCalls[0]).toEqual({
      name: "fn_ai_telemetry_daily_summary",
      args: { p_from: FROM_UTC, p_to: TO_UTC, p_tz: ZONE },
    });
  });

  test("service 필터는 p_service 로 넘긴다", async () => {
    const admin = setup();
    await get({ from: "2026-10-01", to: "2026-10-02", service: "growth" });
    expect(admin.rpcCalls[0]?.args).toMatchObject({ p_service: "growth" });
  });

  test("view 가 없으면 summary 다", async () => {
    const admin = setup();
    await get({ from: "2026-10-01", to: "2026-10-02" });
    expect(admin.rpcCalls[0]?.name).toBe("fn_ai_telemetry_daily_summary");
  });

  test("X-Time-Zone 이 없으면 400 TIME_ZONE_REQUIRED", async () => {
    setup();
    const r = await get({}, "");
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("TIME_ZONE_REQUIRED");
  });

  test("올바르지 않은 X-Time-Zone 은 400 INVALID_TIME_ZONE", async () => {
    setup();
    const r = await get({}, "Mars/Base");
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("INVALID_TIME_ZONE");
  });
});

describe("view=calls", () => {
  test("필터와 구간, 정렬, 페이지 범위를 쿼리에 건다", async () => {
    const admin = setup();
    calls = () => ({ data: [], error: null, count: 45 });
    const r = await get({
      view: "calls",
      from: "2026-10-01",
      to: "2026-10-02",
      service: "growth",
      feature: " report ",
      status: "error",
      kind: "embed",
      retried: "1",
      page: "3",
      pageSize: "20",
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [], total: 45, page: 3, pageSize: 20 });
    const q = firstQuery(admin, "ai_model_calls");
    expect(argsOf(q, "select")).toEqual(["*", { count: "exact" }]);
    expect(argsOf(q, "gte")).toEqual(["created_at", FROM_UTC]);
    expect(argsOf(q, "lt")).toEqual(["created_at", TO_UTC]);
    expect(callsOf(q, "eq").map((c) => c.args)).toEqual([
      ["service", "growth"],
      ["feature", "report"],
      ["status", "error"],
      ["kind", "embed"],
    ]);
    expect(callsOf(q, "gte")[1]?.args).toEqual(["attempt", 2]);
    expect(callsOf(q, "order").map((c) => c.args)).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(argsOf(q, "range")).toEqual([40, 59]);
  });

  test.each([
    ["status", { status: "x" }],
    ["kind", { kind: "x" }],
    ["page 0", { page: "0" }],
    ["pageSize 101", { pageSize: "101" }],
  ])("잘못된 %s 는 400 VALIDATION_FAILED", async (_n, extra) => {
    const admin = setup();
    const r = await get({ view: "calls", ...extra });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.some((q) => q.table === "ai_model_calls")).toBe(false);
  });
});

describe("view=citations", () => {
  test("구간을 rpc 로 넘기고 { items } 로 돌려준다", async () => {
    const admin = setup();
    const r = await get({
      view: "citations",
      from: "2026-10-01",
      to: "2026-10-02",
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [] });
    expect(admin.rpcCalls[0]).toEqual({
      name: "fn_ai_telemetry_citations",
      args: { p_from: FROM_UTC, p_to: TO_UTC },
    });
  });
});

describe("view=pricing", () => {
  test("저장된 단가표와 updatedAt 을 돌려주고 시간대는 필요 없다", async () => {
    setup();
    const table = {
      "gemini-x": {
        input_usd_per_1m: 1,
        output_usd_per_1m: 2,
        cached_input_usd_per_1m: 0.5,
      },
    };
    settings = () => ({
      data: { value: table, updated_at: "2026-10-01T00:00:00Z" },
      error: null,
    });
    const r = await get({ view: "pricing" }, "");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      pricing: table,
      updatedAt: "2026-10-01T00:00:00Z",
    });
  });

  test("설정 전이면 빈 표와 null", async () => {
    setup();
    const r = await get({ view: "pricing" }, "");
    expect(r.body).toEqual({ pricing: {}, updatedAt: null });
  });
});

describe("입력 검증", () => {
  test.each([
    ["모르는 view", { view: "nope" }],
    ["달력에 없는 날짜", { from: "2026-02-30", to: "2026-03-01" }],
    ["from 이 to 보다 뒤", { from: "2026-10-05", to: "2026-10-01" }],
    ["366일 초과 구간", { from: "2025-01-01", to: "2026-10-01" }],
    ["모르는 service", { service: "nope" }],
  ])("%s 는 400 VALIDATION_FAILED", async (_n, query) => {
    const admin = setup();
    const r = await get(query);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.rpcCalls).toEqual([]);
  });
});
