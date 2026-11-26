// POST /api/admin/me/activate 계약 검증. 초대받은 본인의 admin_members 행을 active 로 올린다.
// fn_activate_admin_member 는 auth.uid() 를 읽으므로 사용자 토큰 클라이언트로 불러야 한다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  rpc: vi.fn(),
  createUserClient: vi.fn(),
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: kit.createUserClient,
}));

import { app } from "../app.js";

const handler = { app, path: "/api/admin/me/activate" };

const post = (token: string | null = "user-token") =>
  callRoute(handler, {
    method: "POST",
    headers: { authorization: token ? `Bearer ${token}` : "" },
  });

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "invited-1", email: "i@example.com" };
  kit.rpc.mockReset();
  kit.rpc.mockResolvedValue({ data: { status: "active" }, error: null });
  kit.createUserClient.mockReset();
  kit.createUserClient.mockReturnValue({ rpc: kit.rpc });
});

describe("POST /api/admin/me/activate", () => {
  test("토큰이 없으면 401 UNAUTHENTICATED 다", async () => {
    const out = await post(null);

    expect(out.status).toBe(401);
    expect((out.body as { code: string }).code).toBe("UNAUTHENTICATED");
    expect(kit.rpc).not.toHaveBeenCalled();
  });

  test("GET 은 405 METHOD_NOT_ALLOWED 이고 Allow 는 POST 다", async () => {
    const out = await callRoute(handler, { method: "GET" });

    expect(out.status).toBe(405);
    expect(out.headers.allow).toBe("POST");
  });

  test("활성화되면 status active 를 돌려준다", async () => {
    const out = await post();

    expect(out.status).toBe(200);
    expect(out.body).toEqual({ status: "active" });
  });

  test("호출자 토큰의 사용자 클라이언트로 인자 없이 rpc 를 부른다", async () => {
    await post("caller-token");

    expect(kit.createUserClient).toHaveBeenCalledWith("caller-token");
    expect(kit.rpc).toHaveBeenCalledWith("fn_activate_admin_member");
  });

  test("정지 상태는 정지 그대로 돌려준다", async () => {
    kit.rpc.mockResolvedValue({ data: { status: "suspended" }, error: null });

    const out = await post();

    expect(out.body).toEqual({ status: "suspended" });
  });

  test("본인 행이 없으면 status 가 null 이다", async () => {
    kit.rpc.mockResolvedValue({ data: null, error: null });

    const out = await post();

    expect(out.status).toBe(200);
    expect(out.body).toEqual({ status: null });
  });

  test("rpc 가 실패하면 500 INTERNAL_ERROR 다", async () => {
    kit.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const out = await post();

    expect(out.status).toBe(500);
    expect((out.body as { code: string }).code).toBe("INTERNAL_ERROR");
  });
});
