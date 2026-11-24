// GET, PATCH /api/admin/staff/:profileId 계약 검증. 최고 관리자 전용 메뉴(adminMembers)다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./[profileId].js";

const P = "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const MEMBER = {
  profile_id: P,
  role_id: "11111111-1111-4111-8111-111111111111",
  department: "운영팀",
  status: "active",
  member_name: "김관리",
};

function superAdmin(isSuper: boolean) {
  kit.state.rpc.fn_is_super_admin = () => ({ data: isSuper, error: null });
}

let effectiveArgs: Record<string, unknown> | undefined;

beforeEach(() => {
  effectiveArgs = undefined;
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@t.local" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.admin_member_directory = (f) =>
    f.profile_id === P ? MEMBER : null;
  kit.state.rows.admin_member_permissions = () => [
    { resource_key: "members", level: "view" },
  ];
  kit.state.rpc.fn_admin_effective_permissions = (args) => {
    effectiveArgs = args;
    return {
      data: [
        { resource_key: "members", level: "view" },
        { resource_key: "tenants", level: "edit" },
      ],
      error: null,
    };
  };
  superAdmin(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const get = (id: string = P) =>
  callHandler(handler, undefined, "GET", { profileId: id });

describe("GET /api/admin/staff/:profileId", () => {
  test("최고 관리자가 아니면 403 이고 읽지 않는다", async () => {
    superAdmin(false);

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "FORBIDDEN" });
    expect(kit.state.reads.map((x) => x.table)).not.toContain(
      "admin_member_directory",
    );
  });

  test("멤버, 개별 권한, 실효 권한을 돌려준다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      member: MEMBER,
      overrides: [{ resourceKey: "members", level: "view" }],
      effective: [
        { resourceKey: "members", level: "view" },
        { resourceKey: "tenants", level: "edit" },
      ],
    });
    expect(r.body).not.toHaveProperty("ok");
    expect(effectiveArgs).toEqual({ p_profile_id: P });
  });

  test("없는 관리자는 404 NOT_FOUND", async () => {
    const r = await get("8a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c");

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "NOT_FOUND",
      detail: "관리자를 찾을 수 없습니다.",
    });
  });

  test("uuid 가 아닌 id 는 400", async () => {
    const r = await get("not-a-uuid");

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
