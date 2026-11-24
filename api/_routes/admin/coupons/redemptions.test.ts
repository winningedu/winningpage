// GET /api/admin/coupons/redemptions?couponId= 계약 검증. 쿠폰의 사용 이력에 사용자 이름을 붙여 돌려준다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./redemptions.js";

const COUPON_ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

let tables: Record<string, Respond> = {};

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "coupons", level }] : [],
    tables,
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const ok =
  (data: unknown): Respond =>
  () => ({ data, error: null });

beforeEach(() => {
  tables = {
    coupons: ok({ id: COUPON_ID }),
    coupon_redemptions: ok([
      { id: 1, user_id: U1 },
      { id: 2, user_id: U2 },
      { id: 3, user_id: null },
      { id: 4, user_id: U1 },
    ]),
    profiles: ok([
      { id: U1, name: "홍길동", email: "a@example.com" },
      { id: U2, name: null, email: "b@example.com" },
    ]),
  };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const get = (query: Record<string, string> = { couponId: COUPON_ID }) =>
  callRoute(handler, { query });

describe("GET /api/admin/coupons/redemptions", () => {
  test("view 권한이면 행마다 사용자 이름과 이메일을 붙여 돌려준다", async () => {
    setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [
        {
          id: 1,
          user_id: U1,
          user: { name: "홍길동", email: "a@example.com" },
        },
        { id: 2, user_id: U2, user: { name: null, email: "b@example.com" } },
        { id: 3, user_id: null, user: null },
        {
          id: 4,
          user_id: U1,
          user: { name: "홍길동", email: "a@example.com" },
        },
      ],
    });
  });

  test("행은 쿠폰 id 로 걸러 created_at 내림차순 200건까지 읽는다", async () => {
    const admin = setup();
    await get();
    const query = firstQuery(admin, "coupon_redemptions");
    expect(argsOf(query, "select")).toEqual(["*"]);
    expect(argsOf(query, "eq")).toEqual(["coupon_id", COUPON_ID]);
    expect(argsOf(query, "order")).toEqual([
      "created_at",
      { ascending: false },
    ]);
    expect(argsOf(query, "limit")).toEqual([200]);
  });

  test("프로필은 중복 없는 사용자 id 로만 한 번 읽는다", async () => {
    const admin = setup();
    await get();
    const profiles = admin.queries.filter((q) => q.table === "profiles");
    expect(profiles).toHaveLength(2);
    const lookup = profiles.find((q) => argsOf(q, "in") !== undefined);
    expect(argsOf(lookup as never, "select")?.[0]).toBe("id, name, email");
    expect(argsOf(lookup as never, "in")).toEqual(["id", [U1, U2]]);
  });

  test("사용자가 하나도 없으면 프로필을 읽지 않는다", async () => {
    tables.coupon_redemptions = ok([{ id: 3, user_id: null }]);
    const admin = setup();
    const r = await get();
    expect(
      admin.queries.filter((q) => argsOf(q, "in") !== undefined),
    ).toHaveLength(0);
    expect(r.body).toEqual({ items: [{ id: 3, user_id: null, user: null }] });
  });

  test("프로필 조회가 실패하면 사용자만 모두 null 이고 경고를 남긴다", async () => {
    tables.profiles = () => ({ data: null, error: { message: "boom" } });
    setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(
      (r.body as { items: { user: unknown }[] }).items.map((i) => i.user),
    ).toEqual([null, null, null, null]);
    expect(console.warn).toHaveBeenCalled();
  });

  test("없는 쿠폰은 404 NOT_FOUND 이고 행을 읽지 않는다", async () => {
    tables.coupons = ok(null);
    const admin = setup();
    const r = await get();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
    expect(admin.queries.map((q) => q.table)).not.toContain(
      "coupon_redemptions",
    );
  });

  test.each([
    ["couponId 없음", {}],
    ["uuid 가 아닌 couponId", { couponId: "abc" }],
  ])("%s 이면 400 VALIDATION_FAILED 다", async (_label, query) => {
    setup();
    const r = await get(query);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await get();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("행 조회 오류는 500 INTERNAL_ERROR 다", async () => {
    tables.coupon_redemptions = () => ({
      data: null,
      error: { message: "boom" },
    });
    setup();
    const r = await get();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
