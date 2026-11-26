// 관리자 본인 라우트 응답이 브라우저가 검증하는 계약 스키마(shared/admin-me/contract.ts)를 통과하는지 본다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  adminActivationSchema,
  adminPermissionsSchema,
} from "../../../shared/admin-me/contract.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  rpc: vi.fn(),
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

vi.mock("../../_lib/supabaseUser.js", () => ({
  createSupabaseUserClient: () => ({ rpc: kit.rpc }),
}));

import { app } from "../app.js";

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "admin-1", email: "a@example.com" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [
      { resource_key: "popups", level: "edit" },
      { resource_key: "banners", level: "view" },
    ],
    error: null,
  });
  kit.state.rpc.fn_is_super_admin = () => ({ data: true, error: null });
  kit.rpc.mockReset();
});

describe("관리자 본인 라우트 계약", () => {
  test("GET /permissions 응답이 adminPermissionsSchema 를 통과한다", async () => {
    const r = await callRoute({ app, path: "/api/admin/me/permissions" });
    expect(r.status).toBe(200);
    expect(adminPermissionsSchema.parse(r.body)).toEqual({
      permissions: { popups: "edit", banners: "view" },
      isSuper: true,
    });
  });

  test.each([
    ["active", { status: "active" }],
    ["행 없음", null],
  ])(
    "POST /activate 응답(%s)이 adminActivationSchema 를 통과한다",
    async (_label, data) => {
      kit.rpc.mockResolvedValue({ data, error: null });
      const r = await callRoute(
        { app, path: "/api/admin/me/activate" },
        { method: "POST" },
      );
      expect(r.status).toBe(200);
      expect(adminActivationSchema.safeParse(r.body).success).toBe(true);
    },
  );
});
