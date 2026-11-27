// GET /api/admin/revenue/services 계약 검증. 활성 상품의 서비스 탭 목록을 중복 없이 돌려준다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { revenueServicesSchema } from "../../../shared/revenue/services.js";
import { app } from "../app.js";

const handler = { app, path: "/api/admin/revenue/services" };

let products: unknown[] = [];

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "revenue", level }] : [],
    tables: { products: () => ({ data: products, error: null }) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  products = [];
});

describe("GET /api/admin/revenue/services", () => {
  test("view 권한이면 서비스 키와 이름을 돌려주고 같은 키는 처음 것만 둔다", async () => {
    products = [
      {
        service_key: "growth",
        service_name: "성장 설계",
        service_sort_order: 1,
      },
      {
        service_key: "growth",
        service_name: "다른 이름",
        service_sort_order: 2,
      },
      {
        service_key: "inquiry",
        service_name: "심화 탐구",
        service_sort_order: 3,
      },
    ];
    setup();
    const r = await callRoute(handler);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [
        { key: "growth", label: "성장 설계" },
        { key: "inquiry", label: "심화 탐구" },
      ],
    });
  });

  test("이름이 비면 키를 라벨로 쓰고 키가 빈 행은 건너뛴다", async () => {
    products = [
      { service_key: "target", service_name: null },
      { service_key: "", service_name: "빈 키" },
      { service_key: null, service_name: "널 키" },
    ];
    setup();
    const r = await callRoute(handler);
    expect(r.body).toEqual({ items: [{ key: "target", label: "target" }] });
  });

  test("활성 상품만 서비스 정렬 순서로 읽는다", async () => {
    const admin = setup();
    await callRoute(handler);
    const query = firstQuery(admin, "products");
    expect(argsOf(query, "select")?.[0]).toBe(
      "service_key, service_name, service_sort_order",
    );
    expect(argsOf(query, "eq")).toEqual(["is_active", true]);
    expect(argsOf(query, "order")?.[0]).toBe("service_sort_order");
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await callRoute(handler);
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("조회 오류는 500 INTERNAL_ERROR 다", async () => {
    kit.admin = createAdminFake({
      permissions: [{ resource_key: "revenue", level: "view" }],
      tables: { products: () => ({ data: null, error: { message: "boom" } }) },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await callRoute(handler);
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});

describe("계약", () => {
  test("응답은 계약 스키마를 통과한다", async () => {
    products = [{ service_key: "growth", service_name: "성장 설계" }];
    setup();
    const r = await callRoute(handler);
    expect(revenueServicesSchema.safeParse(r.body).success).toBe(true);
  });
});
