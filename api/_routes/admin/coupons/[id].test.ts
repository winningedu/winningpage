// GET, PATCH /api/admin/coupons/:id 계약 검증. 쿠폰 한 건 조회와 수정.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
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

import handler from "./[id].js";

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";

const PAYLOAD = {
  slug: "welcome",
  code: null,
  tenant_id: null,
  title: "가입 환영",
  discount_amount: 1000,
  min_amount: 0,
  is_active: true,
  stackable: false,
  grant_type: "granted",
  grant_on_signup: false,
  valid_until: null,
  max_uses_per_user: 1,
  max_redemptions: null,
};

let coupons: Respond = () => ({ data: { id: ID, ...PAYLOAD }, error: null });

function setup(level: string | null = "view") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "coupons", level }] : [],
    tables: { coupons: (query) => coupons(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const fail =
  (error: unknown): Respond =>
  () => ({ data: null, error });

beforeEach(() => {
  coupons = () => ({ data: { id: ID, ...PAYLOAD }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/coupons/:id", () => {
  const get = (query: Record<string, string> = { id: ID }) =>
    callRoute(handler, { query });

  test("view 권한이면 id 로 쿠폰 한 건을 돌려준다", async () => {
    const admin = setup();
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: ID, ...PAYLOAD });
    const query = firstQuery(admin, "coupons");
    expect(argsOf(query, "select")).toEqual(["*"]);
    expect(argsOf(query, "eq")).toEqual(["id", ID]);
  });

  test("없는 쿠폰은 404 NOT_FOUND 다", async () => {
    coupons = () => ({ data: null, error: null });
    setup();
    const r = await get();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test.each([
    ["id 없음", {}],
    ["uuid 가 아닌 id", { id: "abc" }],
  ])("%s 이면 400 VALIDATION_FAILED 다", async (_label, query) => {
    const admin = setup();
    const r = await get(query);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.map((q) => q.table)).not.toContain("coupons");
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await get();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("조회 오류는 500 INTERNAL_ERROR 다", async () => {
    coupons = fail({ message: "boom" });
    setup();
    const r = await get();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});

describe("PATCH /api/admin/coupons/:id", () => {
  const patch = (body: unknown = PAYLOAD, query = { id: ID }) =>
    callRoute(handler, { method: "PATCH", query, body });

  test("view 권한으로는 403 FORBIDDEN 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await patch();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(admin.queries.map((q) => q.table)).not.toContain("coupons");
  });

  test("edit 권한이면 id 의 쿠폰을 고치고 고쳐진 행을 돌려준다", async () => {
    const admin = setup("edit");
    const r = await patch();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: ID, ...PAYLOAD });
    const query = firstQuery(admin, "coupons");
    expect(argsOf(query, "update")).toEqual([PAYLOAD]);
    expect(argsOf(query, "eq")).toEqual(["id", ID]);
    expect(argsOf(query, "select")).toEqual(["*"]);
  });

  test("고칠 행이 없으면 404 NOT_FOUND 다", async () => {
    coupons = () => ({ data: null, error: null });
    setup("edit");
    const r = await patch();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test("coupons 컬럼이지만 화면이 만들지 않는 키는 조용히 버리고 13개 키만 고친다", async () => {
    const admin = setup("edit");
    const r = await patch({
      ...PAYLOAD,
      id: ID,
      created_at: "2026-11-24T00:00:00Z",
      org_code: "X",
    });
    expect(r.status).toBe(200);
    expect(argsOf(firstQuery(admin, "coupons"), "update")).toEqual([PAYLOAD]);
  });

  test("소속 쿠폰에 발급형을 얹으면 tenant_id 경로의 400 VALIDATION_FAILED 이고 쓰지 않는다", async () => {
    const admin = setup("edit");
    const r = await patch({
      ...PAYLOAD,
      tenant_id: "5b1e7f3c-2a10-4c55-9a52-0f6d1f8f9b11",
      grant_type: "granted",
    });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect((r.body as { errors: { path: string }[] }).errors).toEqual([
      expect.objectContaining({ path: "tenant_id" }),
    ]);
    expect(admin.queries.map((q) => q.table)).not.toContain("coupons");
  });

  test("소속 쿠폰은 조건형이면 고치고, 발급형은 소속이 없으면 고친다", async () => {
    const admin = setup("edit");
    const auto = {
      ...PAYLOAD,
      tenant_id: "5b1e7f3c-2a10-4c55-9a52-0f6d1f8f9b11",
      grant_type: "auto",
    };
    expect((await patch(auto)).status).toBe(200);
    expect((await patch(PAYLOAD)).status).toBe(200);
    const updates = admin.queries
      .filter((q) => q.table === "coupons")
      .map((q) => argsOf(q, "update"));
    expect(updates).toEqual([[auto], [PAYLOAD]]);
  });

  test("DELETE 는 405 이고 아무것도 쓰지 않는다", async () => {
    const admin = setup("edit");
    const r = await callRoute(handler, {
      method: "DELETE",
      query: { id: ID },
    });
    expect(r.status).toBe(405);
    expect(admin.queries).toEqual([]);
  });

  test.each([
    ["정의되지 않은 키", { ...PAYLOAD, extra: 1 }],
    ["빈 title", { ...PAYLOAD, title: "" }],
    ["본문이 null", null],
  ])("%s 이면 400 VALIDATION_FAILED 이고 쓰지 않는다", async (_label, body) => {
    const admin = setup("edit");
    const r = await patch(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(admin.queries.map((q) => q.table)).not.toContain("coupons");
  });

  test("id 가 uuid 가 아니면 400 VALIDATION_FAILED 다", async () => {
    setup("edit");
    const r = await patch(PAYLOAD, { id: "abc" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
  });

  test.each([
    [{ code: "23505", message: "dup" }, 409, "COUPON_DUPLICATE"],
    [
      {
        code: "23514",
        message: 'violates "coupons_cap_derived_from_grant_type_check"',
      },
      422,
      "COUPON_CAP_MISMATCH",
    ],
    [{ code: "23514", message: "other check" }, 422, "COUPON_CHECK_FAILED"],
    [{ code: "XX000", message: "boom" }, 500, "INTERNAL_ERROR"],
  ])("DB 오류 %o 는 %i %s 다", async (error, status, code) => {
    coupons = fail(error);
    setup("edit");
    const r = await patch();
    expect(r.status).toBe(status);
    expect(problemCode(r.body)).toBe(code);
  });
});
