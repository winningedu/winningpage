// POST /api/enrollment/join-tenant-lookup 계약 검증(기타 소속 학생이 소속코드로 옮길 기관을 확인한다, 결정 96).
// 학생 id 는 토큰에서만 정하고, 오답 횟수 제한(1시간 10회, WC068)과 기타 소속 여부(WC098)는 DB 함수가 판정한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./join-tenant-lookup.js";

const post = (body: unknown) => callHandler(handler, body);

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "student-1", email: "s@example.com" };
  process.env.SITE = "schoolmentor";
});

afterEach(() => {
  delete process.env.SITE;
});

describe("POST /api/enrollment/join-tenant-lookup", () => {
  test("looks the code up for the token's student and returns the institution", async () => {
    const calls: Record<string, unknown>[] = [];
    kit.state.rpc.fn_catch_all_tenant_lookup = (args) => {
      calls.push(args);
      return {
        data: [{ id: "t-1", name: "가나중학교", org_type: "학교" }],
        error: null,
      };
    };

    const r = await post({ code: " abc23456 ", userId: "other" });

    expect(calls).toEqual([{ p_user: "student-1", p_code: "abc23456" }]);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, name: "가나중학교", orgType: "학교" });
  });

  test("a code that matches no institution is 404 TENANT_NOT_FOUND", async () => {
    kit.state.rpc.fn_catch_all_tenant_lookup = () => ({
      data: [],
      error: null,
    });

    expect(await post({ code: "ZZZZZZZZ" })).toMatchObject({
      status: 404,
      body: {
        error: {
          code: "TENANT_NOT_FOUND",
          message: "소속코드를 다시 확인해 주세요.",
        },
      },
    });
  });

  test.each([
    ["WC098", 403, "NOT_CATCH_ALL"],
    ["WC068", 429, "TOO_MANY_ATTEMPTS"],
  ])("%s maps to %i %s with a Korean message", async (pgCode, status, code) => {
    kit.state.rpc.fn_catch_all_tenant_lookup = () => ({
      data: null,
      error: { code: pgCode },
    });

    const r = await post({ code: "ABC23456" });

    expect(r.status).toBe(status);
    expect(r.body).toMatchObject({ error: { code } });
    expect((r.body as { error: { message: string } }).error.message).toMatch(
      /요\.$/,
    );
  });

  test("an unknown RPC failure is 500", async () => {
    kit.state.rpc.fn_catch_all_tenant_lookup = () => ({
      data: null,
      error: { code: "XX000" },
    });
    expect((await post({ code: "ABC23456" })).status).toBe(500);
  });

  test("a blank or missing code is 400 before any lookup", async () => {
    const lookup = vi.fn();
    kit.state.rpc.fn_catch_all_tenant_lookup = lookup;

    expect((await post({ code: "  " })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
  });

  test("outside Schoolmentor it is 404 and nothing is looked up", async () => {
    delete process.env.SITE;
    const lookup = vi.fn();
    kit.state.rpc.fn_catch_all_tenant_lookup = lookup;

    expect((await post({ code: "ABC23456" })).status).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });
});
