// GET, PATCH, DELETE /api/admin/roles/:id 계약 검증. 최고 관리자 전용 메뉴(adminRoles)다.

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

import handler from "./[id].js";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "8a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c";
const ROLE = {
  id: ID,
  name: "추가",
  description: null,
  is_super: false,
  is_system: false,
  created_at: "2026-11-01",
  updated_at: "2026-11-01",
};

function superAdmin(isSuper: boolean) {
  kit.state.rpc.fn_is_super_admin = () => ({ data: isSuper, error: null });
}

const call = (method: string, id: string = ID, body?: unknown) =>
  callHandler(handler, body, method, { id });
const writes = () =>
  kit.state.events.filter((e) => /^(delete|insert|update|upsert):/.test(e));

// 지우기 쿼리(is_system 필터가 붙는다)가 돌려줄 행. 읽기는 ROLE 을 준다.
let deleted: unknown[];

beforeEach(() => {
  deleted = [{ id: ID }];
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@t.local" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.admin_roles = (f) => {
    if (f.id !== ID) return null;
    return "is_system" in f ? deleted : ROLE;
  };
  kit.state.rows.admin_role_permissions = () => [
    { resource_key: "members", level: "edit" },
  ];
  superAdmin(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/roles/:id", () => {
  test("최고 관리자가 아니면 403", async () => {
    superAdmin(false);

    const r = await call("GET");

    expect(r.status).toBe(403);
    expect(kit.state.reads.map((x) => x.table)).not.toContain("admin_roles");
  });

  test("묶음과 권한 항목을 돌려준다", async () => {
    const r = await call("GET");

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ...ROLE,
      permissions: [{ resourceKey: "members", level: "edit" }],
    });
    expect(r.body).not.toHaveProperty("ok");
  });

  test.each([
    ["없는 id", OTHER],
    ["uuid 가 아닌 id", "role-1"],
  ])("%s 는 404 이다", async (_label, id) => {
    const r = await call("GET", id);

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "NOT_FOUND",
      detail: "권한 묶음을 찾을 수 없습니다.",
    });
  });
});

describe("PATCH /api/admin/roles/:id", () => {
  const BODY = { name: " 새 이름 ", description: "" };

  test("최고 관리자가 아니면 403 이고 쓰지 않는다", async () => {
    superAdmin(false);

    const r = await call("PATCH", ID, BODY);

    expect(r.status).toBe(403);
    expect(writes()).toEqual([]);
  });

  test("name 과 description 만 고치고 고친 행을 돌려준다", async () => {
    const r = await call("PATCH", ID, BODY);

    expect(r.status).toBe(200);
    expect(r.body).toEqual(ROLE);
    expect(kit.state.updates).toEqual([
      {
        table: "admin_roles",
        values: { name: "새 이름", description: null },
        filters: { id: ID },
      },
    ]);
  });

  test.each([
    ["is_super", { ...BODY, is_super: true }],
    ["is_system", { ...BODY, is_system: false }],
    ["빈 이름", { name: " ", description: null }],
    ["description 없음", { name: "a" }],
    ["body 없음", undefined],
  ])("%s 는 400 이고 쓰지 않는다", async (_label, body) => {
    const r = await call("PATCH", ID, body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(writes()).toEqual([]);
  });

  test("uuid 가 아닌 id 는 400 이고 쓰지 않는다", async () => {
    const r = await call("PATCH", "role-1", BODY);

    expect(r.status).toBe(400);
    expect(writes()).toEqual([]);
  });

  test("고친 행이 0건이면 404", async () => {
    const r = await call("PATCH", OTHER, BODY);

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("DELETE /api/admin/roles/:id", () => {
  test("최고 관리자가 아니면 403 이고 지우지 않는다", async () => {
    superAdmin(false);

    const r = await call("DELETE");

    expect(r.status).toBe(403);
    expect(writes()).toEqual([]);
  });

  test("지우고 204 를 준다. 시스템 묶음이 아닌 행만 지운다", async () => {
    const r = await call("DELETE");

    expect(r.status).toBe(204);
    expect(kit.state.deletes).toEqual([
      { table: "admin_roles", filters: { id: ID, is_system: false } },
    ]);
  });

  test("없는 묶음은 404 이고 지우지 않는다", async () => {
    const r = await call("DELETE", OTHER);

    expect(r.status).toBe(404);
    expect(writes()).toEqual([]);
  });

  test("기본(시스템) 묶음은 409 SYSTEM_ROLE 이고 지우기를 부르지 않는다", async () => {
    kit.state.rows.admin_roles = () => ({ ...ROLE, is_system: true });

    const r = await call("DELETE");

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "SYSTEM_ROLE",
      detail: "기본 권한 묶음은 삭제할 수 없습니다.",
    });
    expect(writes()).toEqual([]);
  });

  test("쓰는 관리자가 있으면(FK 23503) 409 ROLE_IN_USE", async () => {
    kit.state.deleteErrors.admin_roles = { code: "23503" };

    const r = await call("DELETE");

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "ROLE_IN_USE",
      detail: "이 권한 묶음을 쓰는 관리자가 있어 삭제할 수 없습니다.",
    });
  });

  test("읽은 뒤 사라져 지운 행이 0건이면 404", async () => {
    deleted = [];

    const r = await call("DELETE");

    expect(r.status).toBe(404);
  });

  test("uuid 가 아닌 id 는 400 이고 쓰지 않는다", async () => {
    const r = await call("DELETE", "role-1");

    expect(r.status).toBe(400);
    expect(writes()).toEqual([]);
  });

  test("모르는 DB 오류는 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.deleteErrors.admin_roles = { code: "XX000", message: "홍길동" };

    const r = await call("DELETE");

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
  });
});
