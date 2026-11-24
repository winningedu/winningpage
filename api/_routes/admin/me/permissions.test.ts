// GET /api/admin/me/permissions 계약 검증. 로그인한 관리자 본인의 메뉴 권한 맵과 최고 관리자 여부를 돌려준다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./permissions.js";

// problem 바디는 res.end 로 나가므로 json 과 end 를 모두 받는 가짜 res 로 부른다.
async function get(token: string | null = "token", method = "GET") {
  const out = { status: 0, body: undefined as unknown };
  const headers: Record<string, string> = token
    ? { authorization: `Bearer ${token}` }
    : {};
  const res = {
    req: { headers },
    setHeader: () => res,
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
    end(payload: string) {
      out.body = JSON.parse(payload);
      return res;
    },
  };
  await handler(
    { method, headers, query: {}, body: undefined } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return out;
}

const rpcArgs: Record<string, unknown>[] = [];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "admin-1", email: "a@example.com" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  rpcArgs.length = 0;
  kit.state.rpc.fn_admin_effective_permissions = (args) => {
    rpcArgs.push(args);
    return {
      data: [
        { resource_key: "popups", level: "edit" },
        { resource_key: "banners", level: "view" },
      ],
      error: null,
    };
  };
  kit.state.rpc.fn_is_super_admin = () => ({ data: false, error: null });
});

describe("GET /api/admin/me/permissions", () => {
  test("관리자는 자기 권한 맵과 최고 관리자 여부를 받는다", async () => {
    const out = await get();

    expect(out.status).toBe(200);
    expect(out.body).toEqual({
      permissions: { popups: "edit", banners: "view" },
      isSuper: false,
    });
    expect(rpcArgs).toEqual([{ p_profile_id: "admin-1" }]);
  });

  test("최고 관리자면 isSuper 가 true 다", async () => {
    kit.state.rpc.fn_is_super_admin = () => ({ data: true, error: null });

    const out = await get();

    expect((out.body as { isSuper: boolean }).isSuper).toBe(true);
  });

  test("none 과 빈 키 행은 버린다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [
        { resource_key: "popups", level: "none" },
        { resource_key: "", level: "edit" },
        { resource_key: "banners", level: "view" },
      ],
      error: null,
    });

    const out = await get();

    expect((out.body as { permissions: unknown }).permissions).toEqual({
      banners: "view",
    });
  });

  test("관리자가 아니면 403 FORBIDDEN 이다", async () => {
    kit.state.rows.profiles = () => ({ role: "user" });

    const out = await get();

    expect(out.status).toBe(403);
    expect((out.body as { code: string }).code).toBe("FORBIDDEN");
  });

  test("토큰이 없으면 401 UNAUTHENTICATED 다", async () => {
    const out = await get(null);

    expect(out.status).toBe(401);
    expect((out.body as { code: string }).code).toBe("UNAUTHENTICATED");
  });

  test("권한 rpc 가 실패하면 500 INTERNAL_ERROR 다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: null,
      error: { message: "boom" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await get();

    expect(out.status).toBe(500);
    expect((out.body as { code: string }).code).toBe("INTERNAL_ERROR");
  });

  test("최고 관리자 rpc 가 실패해도 500 INTERNAL_ERROR 다", async () => {
    kit.state.rpc.fn_is_super_admin = () => ({
      data: null,
      error: { message: "boom" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await get();

    expect(out.status).toBe(500);
    expect((out.body as { code: string }).code).toBe("INTERNAL_ERROR");
  });
});
