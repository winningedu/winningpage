// GET /api/admin/revenue 계약 검증. 매출 뷰를 1000행씩 끝까지 읽어 { items } 로 돌려준다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { revenueResponseSchema } from "../../../shared/revenue/contract.js";
import {
  argsOf,
  callRoute,
  callsOf,
  createAdminFake,
  firstQuery,
  problemCode,
  type Query,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { app } from "../app.js";

const route = { app, path: "/api/admin/revenue" };

const FROM = "2026-11-01T00:00:00.000Z";
const TO = "2026-12-01T00:00:00.000Z";

const rows = (count: number, start = 0) =>
  Array.from({ length: count }, (_, i) => ({ order_item_id: start + i }));

let pages: (query: Query) => unknown[] = () => [];

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "revenue", level }] : [],
    tables: {
      admin_revenue_items: (query) => ({ data: pages(query), error: null }),
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const get = (query: Record<string, string> = { from: FROM, to: TO }) =>
  callRoute(route, { query });

beforeEach(() => {
  pages = () => rows(2);
});

describe("권한", () => {
  test("revenue view 권한으로 읽을 수 있다", async () => {
    setup("view");
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: rows(2) });
  });

  test("권한 행이 없으면 403 FORBIDDEN 이고 뷰를 읽지 않는다", async () => {
    const admin = setup(null);
    const r = await get();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "admin_revenue_items",
    );
  });

  test("GET 이외는 405 다", async () => {
    setup("edit");
    const r = await callRoute(route, { method: "POST" });
    expect(r.status).toBe(405);
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
    expect(r.headers.allow).toBe("GET, HEAD");
  });
});

// 뷰가 돌려주는 모양 그대로다. order_item_id 는 bigint 라 숫자로 온다(브라우저가 문자열로 기대하던 어긋남을 계약이 잡는다).
const VIEW_ROW = {
  order_item_id: 7,
  order_id: "o-1",
  paid_at: "2026-11-02T03:00:00Z",
  payer_name: "결제자",
  payer_email: null,
  student_name: "학생",
  service_key: "goal",
  item_name: "목표 상품",
  list_amount: 1000,
  discount_amount: 0,
  paid_amount: 1000,
  refunded_amount: 0,
  revenue_status: "normal",
  net_amount: 1000,
};

describe("응답 계약", () => {
  test("뷰 행이 계약 스키마를 통과하고 no-store 로 내려간다", async () => {
    pages = () => [VIEW_ROW];
    setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(revenueResponseSchema.parse(r.body)).toEqual({ items: [VIEW_ROW] });
  });

  test("order_item_id 가 문자열이면 계약을 통과하지 못한다", () => {
    const parsed = revenueResponseSchema.safeParse({
      items: [{ ...VIEW_ROW, order_item_id: "7" }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("검증", () => {
  test.each([
    ["from 없음", { to: TO }],
    ["from 이 ISO 가 아님", { from: "2026-11-01", to: TO }],
    ["to 에 오프셋", { from: FROM, to: "2026-12-01T00:00:00+09:00" }],
    ["from 과 to 가 같음", { from: FROM, to: FROM }],
    ["from 이 to 보다 늦음", { from: TO, to: FROM }],
  ])("%s 이면 400 VALIDATION_FAILED", async (_label, query) => {
    const admin = setup();
    const r = await get(query);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "admin_revenue_items",
    );
  });
});

describe("조회", () => {
  test("기간, 정렬, 열을 계약대로 건다", async () => {
    const admin = setup();
    await get();
    const query = firstQuery(admin, "admin_revenue_items");
    expect(argsOf(query, "select")?.[0]).toBe(
      "order_item_id, order_id, paid_at, payer_name, payer_email, student_name, service_key, item_name, list_amount, discount_amount, paid_amount, refunded_amount, revenue_status, net_amount",
    );
    expect(argsOf(query, "gte")).toEqual(["paid_at", FROM]);
    expect(argsOf(query, "lt")).toEqual(["paid_at", TO]);
    expect(argsOf(query, "order")).toEqual(["paid_at", { ascending: false }]);
  });

  test("꽉 찬 1000행 페이지 다음 페이지를 계속 읽고 짧은 페이지에서 멈춘다", async () => {
    pages = (query) => {
      const [offset] = argsOf(query, "range") as [number, number];
      return offset === 0
        ? rows(1000)
        : offset === 1000
          ? rows(1000, 1000)
          : rows(3, 2000);
    };
    const admin = setup();
    const r = await get();
    const ranges = admin.queries
      .filter((q) => q.table === "admin_revenue_items")
      .map((q) => callsOf(q, "range")[0]?.args);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect((r.body as { items: unknown[] }).items).toHaveLength(2003);
  });

  test("첫 페이지가 짧으면 한 번만 읽는다", async () => {
    pages = () => rows(999);
    const admin = setup();
    await get();
    expect(
      admin.queries.filter((q) => q.table === "admin_revenue_items"),
    ).toHaveLength(1);
  });

  test("뷰 조회 오류는 500 INTERNAL_ERROR 다", async () => {
    kit.admin = createAdminFake({
      permissions: [{ resource_key: "revenue", level: "view" }],
      tables: {
        admin_revenue_items: () => ({ data: null, error: { message: "boom" } }),
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await get();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
