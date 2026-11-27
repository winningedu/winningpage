// GET /api/admin/staff 계약 검증. 최고 관리자 전용 메뉴(adminMembers)라 일반 관리자는 읽기도 403 이다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffListSchema } from "../../../shared/staff/contract.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
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

import { app } from "../app.js";

const route = { app, path: "/api/admin/staff" };

const get = (method = "GET") => callRoute(route, { method });

const DIRECTORY = [
  {
    profile_id: "p-1",
    status: "active",
    member_name: "김관리",
    invited_at: "2026-11-02",
  },
  {
    profile_id: "p-2",
    status: "invited",
    member_name: "이관리",
    invited_at: "2026-11-01",
  },
];
const ROLES = [{ id: "r-1", name: "실무", is_super: false }];
const RESOURCES = [
  { key: "adminMembers", group_title: "관리자", label: "직원", sort_order: 1 },
];

function superAdmin(isSuper: boolean) {
  kit.state.rpc.fn_is_super_admin = () => ({ data: isSuper, error: null });
  // 모든 메뉴 edit 를 가진 일반 관리자여도 최고 관리자 전용 메뉴는 열리지 않아야 한다.
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [
      { resource_key: "adminMembers", level: "edit" },
      { resource_key: "adminRoles", level: "edit" },
    ],
    error: null,
  });
}

let resourceFilters: Record<string, unknown>;

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@t.local" };
  kit.state.rows.profiles = () => ({ role: "admin" });
  kit.state.rows.admin_member_directory = () => DIRECTORY;
  kit.state.rows.admin_roles = () => ROLES;
  kit.state.rows.admin_resources = (filters) => {
    resourceFilters = filters;
    return RESOURCES;
  };
  superAdmin(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/staff", () => {
  test("최고 관리자가 아니면 edit 권한이 있어도 403 이고 아무것도 읽지 않는다", async () => {
    superAdmin(false);

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(kit.state.reads.map((x) => x.table)).not.toContain(
      "admin_member_directory",
    );
  });

  test("목록, 권한 묶음, 메뉴를 한 객체로 돌려주고 ok 필드는 없다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: DIRECTORY,
      roles: ROLES,
      resources: RESOURCES,
    });
    expect(r.body).not.toHaveProperty("ok");
    expect(staffListSchema.safeParse(r.body).success).toBe(true);
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  test("GET 이외의 메서드는 405 이고 Allow 가 GET, HEAD 다", async () => {
    const r = await get("POST");

    expect(r.status).toBe(405);
    expect(r.body).toMatchObject({ code: "METHOD_NOT_ALLOWED" });
    expect(r.headers.allow).toBe("GET, HEAD");
  });

  test("정렬과 필터가 옛 화면과 같다", async () => {
    await get();

    const read = (table: string) =>
      kit.state.reads.find((x) => x.table === table);
    expect(read("admin_member_directory")?.orderBy).toEqual({
      column: "invited_at",
      ascending: false,
    });
    expect(read("admin_roles")?.orderBy).toEqual({
      column: "name",
      ascending: true,
    });
    expect(read("admin_roles")?.select).toBe("id, name, is_super");
    expect(read("admin_resources")?.orderBy?.column).toBe("sort_order");
    expect(resourceFilters).toEqual({ is_active: true });
  });
});
