// POST /api/admin/coupons/redemptions/:id/void 계약 검증. 사용 이력 한 건을 취소한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callRoute,
  createAdminFake,
  createRecorder,
  problemCode,
  type Respond,
  type Result,
} from "../../../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({
  admin: null as unknown,
  user: null as unknown,
  tokens: [] as string[],
}));

vi.mock("../../../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

vi.mock("../../../../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: (token: string) => {
    kit.tokens.push(token);
    return kit.user;
  },
}));

import handler from "./void.js";

const ROW = { id: 5, voided_at: "2026-11-24T00:00:00Z" };

let tables: Record<string, Respond> = {};
let rpcs: Record<string, (args: Record<string, unknown>) => Result> = {};
let userRecorder: ReturnType<typeof createRecorder>;

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "coupons", level }] : [],
    tables,
  });
  userRecorder = createRecorder({}, rpcs);
  kit.user = { rpc: userRecorder.rpc };
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const post = (
  body: unknown = {},
  query: Record<string, string> = { id: "5" },
) => callRoute(handler, { method: "POST", query, body });

beforeEach(() => {
  kit.tokens = [];
  tables = { coupon_redemptions: () => ({ data: { id: 5 }, error: null }) };
  rpcs = { fn_void_coupon_redemption: () => ({ data: ROW, error: null }) };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/coupons/redemptions/:id/void", () => {
  test("view 권한으로는 403 FORBIDDEN 이고 rpc 를 부르지 않는다", async () => {
    setup("view");
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(userRecorder.rpcCalls).toEqual([]);
  });

  test("edit 권한이면 관리자 토큰 클라이언트로 rpc 를 불러 그 행을 돌려준다", async () => {
    const admin = setup();
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body).toEqual(ROW);
    expect(kit.tokens).toEqual(["admin-token"]);
    expect(userRecorder.rpcCalls).toEqual([
      { name: "fn_void_coupon_redemption", args: { p_redemption_id: 5 } },
    ]);
    expect(admin.rpcCalls.map((c) => c.name)).not.toContain(
      "fn_void_coupon_redemption",
    );
  });

  test("사유는 앞뒤 공백을 걷어 p_reason 으로 넘긴다", async () => {
    setup();
    await post({ reason: "  중복 처리  " });
    expect(userRecorder.rpcCalls[0]?.args).toEqual({
      p_redemption_id: 5,
      p_reason: "중복 처리",
    });
  });

  test("사유가 공백뿐이면 p_reason 을 빼고 부른다", async () => {
    setup();
    await post({ reason: "   " });
    expect(userRecorder.rpcCalls[0]?.args).toEqual({ p_redemption_id: 5 });
  });

  test("대상 행이 없으면 404 NOT_FOUND 이고 rpc 를 부르지 않는다", async () => {
    tables.coupon_redemptions = () => ({ data: null, error: null });
    setup();
    const r = await post();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
    expect(userRecorder.rpcCalls).toEqual([]);
  });

  test.each([
    ["reason 이 문자열이 아님", { reason: 3 }, { id: "5" }],
    ["본문이 null", null, { id: "5" }],
    ["id 없음", {}, {}],
    ["id 가 0", {}, { id: "0" }],
    ["id 가 음수", {}, { id: "-1" }],
    ["id 가 정수가 아님", {}, { id: "1.5" }],
    ["id 가 숫자가 아님", {}, { id: "abc" }],
    ["id 가 0 으로 시작", {}, { id: "05" }],
    ["id 가 안전 정수를 넘음", {}, { id: "99999999999999999999" }],
  ])(
    "%s 이면 400 VALIDATION_FAILED 이고 rpc 를 부르지 않는다",
    async (_label, body, query) => {
      setup();
      const r = await post(body, query);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(userRecorder.rpcCalls).toEqual([]);
    },
  );

  test.each([
    ["42501", 403, "FORBIDDEN"],
    ["WC002", 409, "REDEMPTION_ALREADY_VOIDED"],
    ["XX000", 500, "INTERNAL_ERROR"],
  ])("rpc 오류 %s 는 %i %s 다", async (pgCode, status, code) => {
    rpcs.fn_void_coupon_redemption = () => ({
      data: null,
      error: { code: pgCode, message: "boom" },
    });
    setup();
    const r = await post();
    expect(r.status).toBe(status);
    expect(problemCode(r.body)).toBe(code);
  });

  test("대상 행 조회가 실패하면 500 INTERNAL_ERROR 다", async () => {
    tables.coupon_redemptions = () => ({
      data: null,
      error: { message: "boom" },
    });
    setup();
    const r = await post();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
