// 쿠폰 라우트 응답이 브라우저가 검증하는 계약 스키마(shared/coupon/contract.ts)를 통과하는지 본다.
// 다른 쿠폰 테스트는 필요한 컬럼만 둔 행을 쓰므로, 여기서는 실제 컬럼을 다 채운 행으로 부른다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  couponListSchema,
  couponSchema,
  grantListSchema,
  redemptionListSchema,
  userSearchSchema,
} from "../../../shared/coupon/contract.js";
import {
  argsOf,
  callRoute,
  createAdminFake,
  createRecorder,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  user: null as unknown,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: () => kit.user,
}));

import { app } from "../app.js";

const COUPON_ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const USER_ID = "3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b";

const COUPON = {
  id: COUPON_ID,
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
  org_code: null,
  created_at: "2026-11-01T00:00:00.000Z",
};

const REDEMPTION = {
  id: 1,
  coupon_id: COUPON_ID,
  order_id: "order-1",
  user_id: USER_ID,
  discount_amount: 1000,
  created_at: "2026-11-02T00:00:00.000Z",
  voided_at: null,
  void_reason: null,
};

const GRANT = {
  id: 2,
  coupon_id: COUPON_ID,
  user_id: USER_ID,
  granted_at: "2026-11-03T00:00:00.000Z",
  granted_by: USER_ID,
  valid_until: null,
  revoked_at: null,
  revoke_reason: null,
};

const PROFILE = { id: USER_ID, name: "홍길동", email: "a@example.com" };

// 같은 테이블을 목록(select("*"))과 다른 용도로 읽는 경우를 select 인자로 가른다.
const tables: Record<string, Respond> = {
  coupons: (query) =>
    argsOf(query, "insert") || argsOf(query, "maybeSingle") !== undefined
      ? { data: COUPON, error: null }
      : { data: [COUPON], error: null },
  coupon_redemptions: (query) =>
    argsOf(query, "select")?.[0] === "*"
      ? { data: [REDEMPTION], error: null }
      : { data: [{ coupon_id: COUPON_ID, voided_at: null }], error: null },
  coupon_grants: (query) =>
    argsOf(query, "select")?.[0] === "*"
      ? { data: [GRANT], error: null }
      : { data: [{ coupon_id: COUPON_ID }], error: null },
  profiles: () => ({ data: [PROFILE], error: null }),
};

beforeEach(() => {
  kit.admin = createAdminFake({
    permissions: [{ resource_key: "coupons", level: "edit" }],
    tables,
  });
  kit.user = {
    from: createRecorder({
      tenants: () => ({
        data: [{ id: COUPON_ID, name: "한빛고" }],
        error: null,
      }),
    }).from,
  };
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("쿠폰 응답과 계약 스키마", () => {
  test("목록", async () => {
    const r = await callRoute({ app, path: "/api/admin/coupons" });
    expect(r.status).toBe(200);
    expect(couponListSchema.safeParse(r.body).success).toBe(true);
  });

  test("한 건", async () => {
    const r = await callRoute(
      { app, path: "/api/admin/coupons/:id" },
      { query: { id: COUPON_ID } },
    );
    expect(r.status).toBe(200);
    expect(couponSchema.safeParse(r.body).success).toBe(true);
  });

  test("등록", async () => {
    const { id: _id, org_code: _org, created_at: _at, ...body } = COUPON;
    const r = await callRoute(
      { app, path: "/api/admin/coupons" },
      { method: "POST", body },
    );
    expect(r.status).toBe(201);
    expect(couponSchema.safeParse(r.body).success).toBe(true);
  });

  test("사용 이력", async () => {
    const r = await callRoute(
      { app, path: "/api/admin/coupons/:id/redemptions" },
      { query: { id: COUPON_ID } },
    );
    expect(r.status).toBe(200);
    expect(redemptionListSchema.safeParse(r.body).success).toBe(true);
  });

  test("발급 이력", async () => {
    const r = await callRoute(
      { app, path: "/api/admin/coupons/:id/grants" },
      { query: { id: COUPON_ID } },
    );
    expect(r.status).toBe(200);
    expect(grantListSchema.safeParse(r.body).success).toBe(true);
  });

  test("사용자 검색", async () => {
    const r = await callRoute(
      { app, path: "/api/admin/coupons/user-search" },
      { query: { q: "홍" } },
    );
    expect(r.status).toBe(200);
    expect(userSearchSchema.safeParse(r.body).success).toBe(true);
  });
});
