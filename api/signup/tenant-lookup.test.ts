// POST /api/signup/tenant-lookup 계약 검증(스쿨멘토 가입 1단계, 소속코드 조회).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
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

import { callSignup } from "../_lib/signup/signupTestKit.js";
import handler from "./tenant-lookup.js";

const post = (body: unknown) => callSignup(handler, body);

beforeEach(() => {
  kit.state = createKitState();
  process.env.SITE = "schoolmentor";
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("POST /api/signup/tenant-lookup", () => {
  test("SITE 가 schoolmentor 가 아니면 404 이고 조회하지 않는다", async () => {
    delete process.env.SITE;
    const lookup = vi.fn();
    kit.state.rpc.fn_signup_tenant_lookup = lookup;

    const r = await post({ code: "ABC" });

    expect(r.status).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });

  test("코드와 요청 IP 로 조회하고 기관 정보를 돌려준다", async () => {
    const calls: Record<string, unknown>[] = [];
    kit.state.rpc.fn_signup_tenant_lookup = (args) => {
      calls.push(args);
      return {
        data: [{ id: "t-1", name: "가나중학교", org_type: "학교" }],
        error: null,
      };
    };

    const r = await post({ code: " abc123 " });

    expect(calls).toEqual([{ p_code: "abc123", p_ip: "9.9.9.9" }]);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      tenantId: "t-1",
      name: "가나중학교",
      orgType: "학교",
    });
  });

  test("없는 코드는 404 TENANT_NOT_FOUND", async () => {
    kit.state.rpc.fn_signup_tenant_lookup = () => ({ data: [], error: null });

    const r = await post({ code: "nope" });

    expect(r.status).toBe(404);
    expect(r.body).toEqual({ code: "TENANT_NOT_FOUND" });
  });

  test("실패 10회 초과(WC068)는 429 로 바꾼다", async () => {
    kit.state.rpc.fn_signup_tenant_lookup = () => ({
      data: null,
      error: { code: "WC068" },
    });

    const r = await post({ code: "abc" });

    expect(r.status).toBe(429);
    expect(r.body).toEqual({ code: "WC068" });
  });

  test("코드가 문자열이 아니거나 비면 400 이고 조회하지 않는다", async () => {
    const lookup = vi.fn();
    kit.state.rpc.fn_signup_tenant_lookup = lookup;

    for (const body of [{}, { code: 12 }, { code: "   " }]) {
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ code: "VALIDATION" });
    }
    expect(lookup).not.toHaveBeenCalled();
  });
});
