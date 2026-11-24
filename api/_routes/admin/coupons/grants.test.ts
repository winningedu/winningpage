// GET /api/admin/coupons/grants?couponId= 계약 검증. 쿠폰의 발급 이력(GET)과 쿠폰 발급(POST).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  createRecorder,
  firstQuery,
  problemCode,
  type Respond,
  type Result,
} from "../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  user: null as unknown,
  tokens: [] as string[],
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: (token: string) => {
    kit.tokens.push(token);
    return kit.user;
  },
}));

vi.mock("../../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: (token: string) => {
    kit.tokens.push(token);
    return kit.user;
  },
}));

import handler from "./grants.js";

const COUPON_ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

let tables: Record<string, Respond> = {};
let rpcs: Record<string, (args: Record<string, unknown>) => Result> = {};
let userRecorder: ReturnType<typeof createRecorder>;

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "coupons", level }] : [],
    tables,
  });
  userRecorder = createRecorder({}, rpcs);
  kit.user = { rpc: userRecorder.rpc };
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const ok =
  (data: unknown): Respond =>
  () => ({ data, error: null });

beforeEach(() => {
  kit.tokens = [];
  rpcs = {};
  tables = {
    coupons: ok({ id: COUPON_ID }),
    coupon_grants: ok([
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

describe("GET /api/admin/coupons/grants", () => {
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

  test("행은 쿠폰 id 로 걸러 granted_at 내림차순 200건까지 읽는다", async () => {
    const admin = setup();
    await get();
    const query = firstQuery(admin, "coupon_grants");
    expect(argsOf(query, "select")).toEqual(["*"]);
    expect(argsOf(query, "eq")).toEqual(["coupon_id", COUPON_ID]);
    expect(argsOf(query, "order")).toEqual([
      "granted_at",
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
    tables.coupon_grants = ok([{ id: 3, user_id: null }]);
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
    expect(admin.queries.map((q) => q.table)).not.toContain("coupon_grants");
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
    tables.coupon_grants = () => ({ data: null, error: { message: "boom" } });
    setup();
    const r = await get();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});

describe("POST /api/admin/coupons/grants", () => {
  const USER_ID = U1;
  const GRANT = { id: 9, coupon_id: COUPON_ID, user_id: USER_ID };
  const post = (body: unknown = { couponId: COUPON_ID, userId: USER_ID }) =>
    callRoute(handler, { method: "POST", body });

  beforeEach(() => {
    rpcs.fn_grant_coupon = () => ({ data: GRANT, error: null });
  });

  test("view 권한으로는 403 FORBIDDEN 이고 발급하지 않는다", async () => {
    setup("view");
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(userRecorder.rpcCalls).toEqual([]);
  });

  test("edit 권한이면 관리자 토큰 클라이언트로 정확한 인자의 rpc 를 불러 발급 행을 돌려준다", async () => {
    const admin = setup("edit");
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body).toEqual(GRANT);
    expect(kit.tokens).toEqual(["admin-token"]);
    expect(userRecorder.rpcCalls).toEqual([
      {
        name: "fn_grant_coupon",
        args: { p_coupon_id: COUPON_ID, p_user_id: USER_ID },
      },
    ]);
    expect(admin.rpcCalls.map((c) => c.name)).not.toContain("fn_grant_coupon");
  });

  test("없는 쿠폰은 404 NOT_FOUND 이고 rpc 를 부르지 않는다", async () => {
    tables.coupons = ok(null);
    setup("edit");
    const r = await post();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
    expect(userRecorder.rpcCalls).toEqual([]);
  });

  test.each([
    ["couponId 가 uuid 가 아님", { couponId: "x", userId: USER_ID }],
    ["userId 가 uuid 가 아님", { couponId: COUPON_ID, userId: "x" }],
    ["userId 없음", { couponId: COUPON_ID }],
    ["본문이 null", null],
  ])(
    "%s 이면 400 VALIDATION_FAILED 이고 rpc 를 부르지 않는다",
    async (_label, body) => {
      setup("edit");
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(userRecorder.rpcCalls).toEqual([]);
    },
  );

  test.each([
    ["42501", 403, "FORBIDDEN"],
    ["WC004", 422, "COUPON_NOT_GRANTABLE"],
    ["WC005", 409, "COUPON_ALREADY_REDEEMED"],
    ["P0002", 404, "PROFILE_NOT_FOUND"],
    ["XX000", 500, "INTERNAL_ERROR"],
  ])("rpc 오류 %s 는 %i %s 다", async (pgCode, status, code) => {
    rpcs.fn_grant_coupon = () => ({
      data: null,
      error: { code: pgCode, message: "boom" },
    });
    setup("edit");
    const r = await post();
    expect(r.status).toBe(status);
    expect(problemCode(r.body)).toBe(code);
  });
});
