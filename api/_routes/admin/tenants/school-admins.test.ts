// GET /api/admin/tenants/school-admins 계약 검증(사 #159, 결정 102.6). 본사 권한 tenants view 이상만 읽고,
// 기관의 학교 관리자만 주소, 발급일, 등록취소일과 함께 돌려준다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: (...keys: string[]) => {
    for (const key of keys) if (process.env[key]) return process.env[key];
    return "";
  },
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./school-admins.js";

const TENANT_7 = "7f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const TENANT_8 = "8a2d3b4c-5e6f-4071-9b8c-0d1e2f3a4b5c";

const get = (query: Record<string, string> = {}, method = "GET") =>
  callHandler(handler, undefined, method, query);

const TEACHERS = [
  {
    id: "t-1",
    tenant_id: TENANT_7,
    role: "school_admin",
    name: "박관리",
    phone: "01099998888",
    landline: "0212345678",
    email: "park@example.com",
    position: "교감",
    login_id: "ABCD2345XY7Z9K",
    status: "active",
    created_at: "2026-11-05T05:00:00Z",
    updated_at: "2026-11-05T05:00:00Z",
    deleted_at: null,
  },
  {
    id: "t-2",
    tenant_id: TENANT_7,
    role: "school_admin",
    name: "최취소",
    phone: "01011112222",
    landline: null,
    email: null,
    position: null,
    login_id: null,
    status: "inactive",
    created_at: "2026-10-01T05:00:00Z",
    updated_at: "2026-10-20T05:00:00Z",
    deleted_at: "2026-10-21T05:00:00Z",
  },
  { ...tenantRow("t-3", TENANT_7), role: "homeroom", name: "담임" },
  { ...tenantRow("t-4", TENANT_8), role: "school_admin", name: "다른기관" },
];

function tenantRow(id: string, tenantId: string) {
  return {
    id,
    tenant_id: tenantId,
    phone: "01000000000",
    landline: null,
    email: null,
    position: null,
    login_id: null,
    status: "active",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    deleted_at: null,
  };
}

beforeEach(() => {
  process.env.SITE = "schoolmentor";
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "tenants", level: "view" }],
    error: null,
  });
  kit.state.rows.teachers = (filters) => matchRows(TEACHERS, filters);
  kit.state.rows.tenants = (filters) =>
    filters.id === TENANT_7 ? { address: "서울시 중구 1" } : null;
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("GET /api/admin/tenants/school-admins", () => {
  test.each([
    ["권한 없음", []],
    ["tenants none", [{ resource_key: "tenants", level: "none" }]],
    ["다른 리소스 edit", [{ resource_key: "members", level: "edit" }]],
  ])("%s 이면 403 이고 교사를 읽지 않는다", async (_label, perms) => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: perms,
      error: null,
    });

    const r = await get({ tenantId: TENANT_7 });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(kit.state.reads.map((x) => x.table)).not.toContain("teachers");
  });

  test("그 기관의 학교 관리자만 주소와 함께 돌려주고 담임과 다른 기관은 뺀다", async () => {
    const r = await get({ tenantId: TENANT_7 });

    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const body = r.body as {
      address: string | null;
      admins: { id: string }[];
    };
    expect(body.address).toBe("서울시 중구 1");
    expect(body.admins.map((a) => a.id)).toEqual(["t-1", "t-2"]);
  });

  test("발급일과 등록취소일을 읽기 값으로 싣고 취소하지 않은 관리자는 null 이다", async () => {
    const r = await get({ tenantId: TENANT_7 });

    const { admins } = r.body as { admins: Record<string, unknown>[] };
    expect(admins[0]).toMatchObject({
      name: "박관리",
      phone: "01099998888",
      landline: "0212345678",
      email: "park@example.com",
      position: "교감",
      loginId: "ABCD2345XY7Z9K",
      issuedAt: "2026-11-05T05:00:00Z",
      canceledAt: null,
    });
    expect(admins[1]).toMatchObject({
      loginId: null,
      canceledAt: "2026-10-21T05:00:00Z",
    });
  });

  test("등록취소일은 deleted_at 에서만 오고 deleted_at 이 없는 inactive 는 null 이다", async () => {
    kit.state.rows.teachers = (filters) =>
      matchRows(
        [
          {
            ...tenantRow("t-5", TENANT_7),
            role: "school_admin",
            name: "비활성",
            status: "inactive",
            updated_at: "2026-11-02T00:00:00Z",
            deleted_at: null,
          },
        ],
        filters,
      );

    const r = await get({ tenantId: TENANT_7 });

    const { admins } = r.body as { admins: Record<string, unknown>[] };
    expect(admins[0]).toMatchObject({ id: "t-5", canceledAt: null });
  });

  test("스쿨멘토가 아닌 사이트에서는 404 이고 아무것도 읽지 않는다", async () => {
    delete process.env.SITE;

    const r = await get({ tenantId: TENANT_7 });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(kit.state.reads).toHaveLength(0);
  });

  test("tenantId 가 UUID 가 아니면 400 이고 아무것도 읽지 않는다", async () => {
    const r = await get({ tenantId: "tenant-7" });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(kit.state.reads.map((x) => x.table)).not.toContain("teachers");
  });

  test("tenantId 가 없으면 400", async () => {
    const r = await get();

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
  });
});
