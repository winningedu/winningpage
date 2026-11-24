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
const ROLE = "22222222-2222-4222-8222-222222222222";
const FORM = { roleId: ROLE, department: "  개발팀 ", status: "suspended" };
const patch = (body: unknown, id: string = P) =>
  callHandler(handler, body, "PATCH", { profileId: id });

const updates = () =>
  kit.state.updates.filter((u) => u.table === "admin_members");

describe("PATCH /api/admin/staff/:profileId", () => {
  beforeEach(() => {
    kit.state.rows.admin_members = (f) =>
      f.profile_id === P ? [{ profile_id: P }] : [];
  });

  test("최고 관리자가 아니면 403 이고 쓰지 않는다", async () => {
    superAdmin(false);

    const r = await patch(FORM);

    expect(r.status).toBe(403);
    expect(updates()).toEqual([]);
  });

  test("role_id, department, status 세 칼럼만 쓰고 부서는 다듬는다", async () => {
    const r = await patch(FORM);

    expect(r.status).toBe(200);
    expect(updates()).toEqual([
      {
        table: "admin_members",
        values: { role_id: ROLE, department: "개발팀", status: "suspended" },
        filters: { profile_id: P },
      },
    ]);
    // 저장 뒤 목록 뷰의 행을 다시 읽어 돌려준다.
    expect(r.body).toEqual(MEMBER);
    expect(r.body).not.toHaveProperty("ok");
  });

  test("빈 부서는 null, roleId null 은 묶음 해제", async () => {
    await patch({ roleId: null, department: "   ", status: "invited" });

    expect(updates()[0]?.values).toEqual({
      role_id: null,
      department: null,
      status: "invited",
    });
  });

  test.each([
    ["모르는 키", { ...FORM, profile_id: "x" }],
    ["is_super 같은 컬럼", { ...FORM, is_super: true }],
    ["잘못된 status", { ...FORM, status: "deleted" }],
    ["uuid 가 아닌 roleId", { ...FORM, roleId: "role-1" }],
    ["status 없음", { roleId: ROLE, department: null }],
    ["body 없음", undefined],
  ])("%s 는 400 이고 쓰지 않는다", async (_label, body) => {
    const r = await patch(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(updates()).toEqual([]);
  });

  test("uuid 가 아닌 경로 id 는 400", async () => {
    const r = await patch(FORM, "nope");

    expect(r.status).toBe(400);
    expect(updates()).toEqual([]);
  });

  test("고친 행이 0건이면 404", async () => {
    const r = await patch(FORM, "8a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c");

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "NOT_FOUND",
      detail: "관리자를 찾을 수 없습니다.",
    });
  });

  test("마지막 최고 관리자 보호 트리거(WC059)는 409 LAST_SUPER_ADMIN", async () => {
    kit.state.updateErrors.admin_members = () => ({
      code: "WC059",
      message: "last super admin",
    });

    const r = await patch(FORM);

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "LAST_SUPER_ADMIN",
      detail:
        "최고 관리자가 1명뿐이라 강등, 정지, 삭제할 수 없습니다. 다른 사람을 먼저 최고 관리자로 올려 주세요.",
    });
  });

  test("없는 권한 묶음(FK 23503)은 400 VALIDATION_FAILED 이고 roleId 경로를 가리킨다", async () => {
    kit.state.updateErrors.admin_members = () => ({ code: "23503" });

    const r = await patch(FORM);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "roleId", message: "권한 묶음을 찾을 수 없습니다." }],
    });
  });

  test("모르는 DB 오류는 500 이고 원문을 싣지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.updateErrors.admin_members = () => ({
      code: "XX000",
      message: "secret_relation 홍길동",
    });

    const r = await patch(FORM);

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
  });
});
