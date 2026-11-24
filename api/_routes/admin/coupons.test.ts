// /api/admin/coupons 계약 검증. GET 은 목록과 곁가지(사용 통계, 발급 쿠폰, 소속)를 따로 열화시켜 돌려주고, POST 는 쿠폰을 등록한다.

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
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  user: null as unknown,
  tokens: [] as string[],
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: (token: string) => {
    kit.tokens.push(token);
    return kit.user;
  },
}));

import handler from "./coupons.js";

const TENANT_ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";

const PAYLOAD = {
  slug: "welcome",
  code: "WELCOME",
  tenant_id: null,
  title: "가입 환영",
  discount_amount: 1000,
  min_amount: 0,
  is_active: true,
  stackable: false,
  grant_type: "auto",
  grant_on_signup: false,
  valid_until: "2026-12-31",
  max_uses_per_user: null,
  max_redemptions: null,
};

type Tables = Record<string, Respond>;
let adminTables: Tables = {};
let userTables: Tables = {};
let userRecorder: ReturnType<typeof createRecorder>;

function setup(level: string | null = "view", extra: { qa?: boolean } = {}) {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "coupons", level }] : [],
    tables: {
      ...(extra.qa
        ? { qa_accounts: () => ({ data: { profile_id: "admin-1" } }) }
        : {}),
      ...adminTables,
    },
  });
  userRecorder = createRecorder(userTables);
  kit.user = { from: userRecorder.from, rpc: userRecorder.rpc };
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const ok =
  (data: unknown, extra: Partial<Result> = {}): Respond =>
  () => ({
    data,
    error: null,
    ...extra,
  });
const fail =
  (error: unknown = { message: "boom" }): Respond =>
  () => ({
    data: null,
    error,
  });

beforeEach(() => {
  kit.tokens = [];
  adminTables = {
    coupons: ok([{ id: "c1", slug: "a" }]),
    coupon_redemptions: ok([]),
    coupon_grants: ok([]),
  };
  userTables = { tenants: ok([{ id: TENANT_ID, name: "한빛고" }]) };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/admin/coupons", () => {
  test("view 권한이면 목록과 곁가지를 한 객체로 돌려준다", async () => {
    adminTables.coupon_redemptions = ok([
      { coupon_id: "c1", voided_at: null },
      { coupon_id: "c1", voided_at: "2026-11-01T00:00:00Z" },
      { coupon_id: "c2", voided_at: null },
    ]);
    adminTables.coupon_grants = ok([
      { coupon_id: "c1" },
      { coupon_id: "c1" },
      { coupon_id: "c3" },
    ]);
    setup();
    const r = await callRoute(handler);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [{ id: "c1", slug: "a" }],
      redemptionStats: {
        byCoupon: {
          c1: { active: 1, total: 2 },
          c2: { active: 1, total: 1 },
        },
        truncated: false,
      },
      grantedCouponIds: ["c1", "c3"],
      tenants: [{ id: TENANT_ID, name: "한빛고" }],
    });
  });

  test("쿠폰은 slug 오름차순, 사용 통계와 발급은 만 행 한도로 읽는다", async () => {
    const admin = setup();
    await callRoute(handler);
    expect(argsOf(firstQuery(admin, "coupons"), "order")).toEqual([
      "slug",
      { ascending: true },
    ]);
    const redemptions = firstQuery(admin, "coupon_redemptions");
    expect(argsOf(redemptions, "select")?.[0]).toBe("coupon_id, voided_at");
    expect(argsOf(redemptions, "limit")).toEqual([10000]);
    const grants = firstQuery(admin, "coupon_grants");
    expect(argsOf(grants, "is")).toEqual(["revoked_at", null]);
    expect(argsOf(grants, "limit")).toEqual([10000]);
  });

  test("사용 행이 만 건에 닿으면 truncated 다", async () => {
    adminTables.coupon_redemptions = ok(
      Array.from({ length: 10000 }, () => ({
        coupon_id: "c1",
        voided_at: null,
      })),
    );
    setup();
    const r = await callRoute(handler);
    expect(
      (r.body as { redemptionStats: { truncated: boolean } }).redemptionStats
        .truncated,
    ).toBe(true);
  });

  test("소속은 service_role 이 아니라 관리자 토큰 클라이언트로 읽는다", async () => {
    const admin = setup();
    await callRoute(handler);
    expect(kit.tokens).toEqual(["admin-token"]);
    expect(admin.queries.map((q) => q.table)).not.toContain("tenants");
    const tenants = firstQuery(userRecorder, "tenants");
    expect(argsOf(tenants, "select")?.[0]).toBe("id, name");
    expect(argsOf(tenants, "order")?.[0]).toBe("name");
  });

  test("사용 통계 조회가 실패하면 그 필드만 null 이고 경고를 남긴다", async () => {
    adminTables.coupon_redemptions = fail();
    setup();
    const r = await callRoute(handler);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      items: [{ id: "c1", slug: "a" }],
      redemptionStats: null,
      grantedCouponIds: [],
      tenants: [{ id: TENANT_ID, name: "한빛고" }],
    });
    expect(console.warn).toHaveBeenCalled();
  });

  test("발급 쿠폰 조회가 실패하면 그 필드만 null 이다", async () => {
    adminTables.coupon_grants = fail();
    setup();
    const r = await callRoute(handler);
    expect(r.body).toMatchObject({
      grantedCouponIds: null,
      redemptionStats: { truncated: false },
      tenants: [{ id: TENANT_ID, name: "한빛고" }],
    });
  });

  test("소속 조회가 실패하면 그 필드만 null 이다", async () => {
    userTables.tenants = fail();
    setup();
    const r = await callRoute(handler);
    expect(r.body).toMatchObject({
      tenants: null,
      items: [{ id: "c1", slug: "a" }],
      grantedCouponIds: [],
    });
  });

  test("쿠폰 목록 조회가 실패하면 500 INTERNAL_ERROR 다", async () => {
    adminTables.coupons = fail();
    setup();
    const r = await callRoute(handler);
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await callRoute(handler);
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });
});

describe("POST /api/admin/coupons", () => {
  const post = (body: unknown = PAYLOAD) =>
    callRoute(handler, { method: "POST", body });

  test("view 권한으로는 403 FORBIDDEN 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(admin.queries.map((q) => q.table)).not.toContain("coupons");
  });

  test("edit 권한이면 201 과 저장된 행을 돌려준다", async () => {
    adminTables.coupons = ok({ id: "new", ...PAYLOAD });
    const admin = setup("edit");
    const r = await post();
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ id: "new", ...PAYLOAD });
    const query = firstQuery(admin, "coupons");
    expect(argsOf(query, "insert")).toEqual([PAYLOAD]);
    expect(argsOf(query, "select")).toEqual(["*"]);
  });

  test("문자열은 앞뒤 공백을 걷어 저장한다", async () => {
    adminTables.coupons = ok({ id: "new" });
    const admin = setup("edit");
    await post({ ...PAYLOAD, slug: " welcome ", title: " 가입 환영 " });
    expect(argsOf(firstQuery(admin, "coupons"), "insert")).toEqual([PAYLOAD]);
  });

  test.each([
    ["빈 slug", { slug: "  " }],
    ["빈 code", { code: "" }],
    ["uuid 가 아닌 tenant_id", { tenant_id: "x" }],
    ["빈 title", { title: "" }],
    ["정수가 아닌 discount_amount", { discount_amount: 1.5 }],
    ["잘못된 grant_type", { grant_type: "other" }],
    ["날짜가 아닌 valid_until", { valid_until: "2026-12-31T00:00:00Z" }],
    ["정의되지 않은 키", { extra: 1 }],
  ])(
    "%s 이면 400 VALIDATION_FAILED 이고 쓰지 않는다",
    async (_label, patch) => {
      const admin = setup("edit");
      const r = await post({ ...PAYLOAD, ...patch });
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(admin.queries.map((q) => q.table)).not.toContain("coupons");
    },
  );

  test("23505 는 409 COUPON_DUPLICATE 다", async () => {
    adminTables.coupons = fail({ code: "23505", message: "dup" });
    setup("edit");
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("COUPON_DUPLICATE");
  });

  test("상한 제약 위반 23514 는 422 COUPON_CAP_MISMATCH 다", async () => {
    adminTables.coupons = fail({
      code: "23514",
      message:
        'new row violates check constraint "coupons_cap_derived_from_grant_type_check"',
    });
    setup("edit");
    const r = await post();
    expect(r.status).toBe(422);
    expect(problemCode(r.body)).toBe("COUPON_CAP_MISMATCH");
  });

  test("다른 23514 는 422 COUPON_CHECK_FAILED 다", async () => {
    adminTables.coupons = fail({
      code: "23514",
      message: 'violates check constraint "coupons_discount_amount_check"',
    });
    setup("edit");
    const r = await post();
    expect(r.status).toBe(422);
    expect(problemCode(r.body)).toBe("COUPON_CHECK_FAILED");
  });

  test("그 밖의 오류는 500 INTERNAL_ERROR 다", async () => {
    adminTables.coupons = fail({ code: "XX000", message: "boom" });
    setup("edit");
    const r = await post();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });

  test("QA 관리자의 쓰기는 403 이고 쿠폰을 쓰지 않는다", async () => {
    vi.stubEnv("QA_ACCOUNT_GUARD_ENABLED", "true");
    const admin = setup("edit", { qa: true });
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("QA_ACCOUNT_READ_ONLY");
    expect(admin.queries.map((q) => q.table)).not.toContain("coupons");
  });
});
