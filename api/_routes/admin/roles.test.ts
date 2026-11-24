// GET, POST /api/admin/roles 계약 검증. 최고 관리자 전용 메뉴(adminRoles)다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import roles from "./roles.js";

const ROLE_COLUMNS =
  "id, name, description, is_super, is_system, created_at, updated_at";
const ROLE_A = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "실무",
  description: null,
  is_super: false,
  is_system: true,
  created_at: "2026-11-01",
  updated_at: "2026-11-01",
};
const ROLE_B = {
  ...ROLE_A,
  id: "22222222-2222-4222-8222-222222222222",
  name: "추가",
};
const RESOURCES = [
  { key: "members", group_title: "회원", label: "회원", sort_order: 1 },
];

function superAdmin(isSuper: boolean) {
  kit.state.rpc.fn_is_super_admin = () => ({ data: isSuper, error: null });
}

const get = () => callHandler(roles, undefined, "GET");
const post = (body: unknown) => callHandler(roles, body, "POST");
const inserts = () =>
  kit.state.inserts.filter((x) => x.table === "admin_roles");

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@t.local" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.admin_roles = () => [ROLE_A, ROLE_B];
  kit.state.rows.admin_resources = () => RESOURCES;
  kit.state.rows.admin_role_permissions = () => [
    { role_id: ROLE_A.id, resource_key: "members", level: "edit" },
    { role_id: ROLE_A.id, resource_key: "tenants", level: "view" },
  ];
  superAdmin(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/roles", () => {
  test("최고 관리자가 아니면 403 이고 읽지 않는다", async () => {
    superAdmin(false);

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "FORBIDDEN" });
    expect(kit.state.reads.map((x) => x.table)).not.toContain("admin_roles");
  });

  test("묶음마다 권한 항목을 붙이고 메뉴 목록을 함께 준다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [
        {
          ...ROLE_A,
          permissions: [
            { resourceKey: "members", level: "edit" },
            { resourceKey: "tenants", level: "view" },
          ],
        },
        { ...ROLE_B, permissions: [] },
      ],
      resources: RESOURCES,
    });
    expect(r.body).not.toHaveProperty("ok");
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const read = kit.state.reads.find((x) => x.table === "admin_roles");
    expect(read?.select).toBe(ROLE_COLUMNS);
    expect(read?.orderBy).toEqual({ column: "created_at", ascending: true });
  });
});

describe("POST /api/admin/roles", () => {
  beforeEach(() => {
    kit.state.rows.admin_roles = () => ROLE_B;
  });

  test("최고 관리자가 아니면 403 이고 쓰지 않는다", async () => {
    superAdmin(false);

    const r = await post({ name: "추가", description: null });

    expect(r.status).toBe(403);
    expect(inserts()).toEqual([]);
  });

  test("name 과 description 만 넣고 201 로 만든 행을 돌려준다", async () => {
    const r = await post({ name: "  추가 ", description: " 설명 " });

    expect(r.status).toBe(201);
    expect(r.body).toEqual(ROLE_B);
    expect(r.body).not.toHaveProperty("ok");
    expect(inserts()).toEqual([
      { table: "admin_roles", row: { name: "추가", description: "설명" } },
    ]);
  });

  test("빈 설명은 null 로 넣는다", async () => {
    await post({ name: "추가", description: "  " });

    expect(inserts()[0]?.row).toEqual({ name: "추가", description: null });
  });

  test.each([
    ["is_super", { name: "추가", description: null, is_super: true }],
    ["is_system", { name: "추가", description: null, is_system: true }],
    ["모르는 키", { name: "추가", description: null, id: "x" }],
    ["description 없음", { name: "추가" }],
    ["body 없음", undefined],
  ])("%s 는 400 이고 쓰지 않는다", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(inserts()).toEqual([]);
  });

  test("공백뿐인 이름은 400 이고 옛 문구를 쓴다", async () => {
    const r = await post({ name: "   ", description: null });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "name", message: "권한 묶음 이름을 입력해 주세요." }],
    });
    expect(inserts()).toEqual([]);
  });

  test("DB 오류는 500 이고 원문을 싣지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.insertErrors.admin_roles = { message: "secret 홍길동" };

    const r = await post({ name: "추가", description: null });

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("홍길동");
  });
});
