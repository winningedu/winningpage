// GET /api/admin/members 계약 검증. 회원 목록과 파생 필드(이용서비스, 소속 이름).

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSectionAdmin,
  type SectionDb,
} from "../../_lib/admin-sections/sectionTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";
import { MEMBER_ID, seedMembersDb } from "../../_lib/members/membersTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as SectionDb,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createSectionAdmin(kit.state, kit.db),
}));

import handler from "./members.js";

const get = (method = "GET") => callHandler(handler, undefined, method);

const TABLES = {
  profiles: [
    {
      id: MEMBER_ID,
      name: "가 학생",
      tenant_id: "t-1",
      created_at: "2026-03-01T00:00:00Z",
    },
    {
      id: "m-2",
      name: "나 학생",
      tenant_id: null,
      created_at: "2026-05-01T00:00:00Z",
    },
  ],
  program_access: [
    { id: MEMBER_ID, program_key: "diagnose", access_status: "active" },
    { id: MEMBER_ID, program_key: "target", access_status: "active" },
    { id: MEMBER_ID, program_key: "growth", access_status: "expired" },
    { id: "m-2", program_key: "growth", access_status: "suspended" },
  ],
  tenants: [{ id: "t-1", name: "한빛 학원" }],
};

beforeEach(() => {
  kit.state = createKitState();
  kit.db = seedMembersDb(kit.state, "view", TABLES, "view");
});

describe("GET /api/admin/members", () => {
  test("view 권한이면 최신순 목록에 이용서비스와 소속 이름을 얹어 돌려준다", async () => {
    const r = await get();

    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    const items = (r.body as { items: Record<string, unknown>[] }).items;
    expect(items.map((x) => x.id)).toEqual(["m-2", MEMBER_ID, "admin-1"]);
    expect(items.find((x) => x.id === MEMBER_ID)).toMatchObject({
      name: "가 학생",
      service_labels: "diagnose, target",
      tenant_name: "한빛 학원",
    });
    expect(items.find((x) => x.id === "m-2")).toMatchObject({
      service_labels: "",
      tenant_name: "",
    });
    const read = kit.db.calls.find(
      (c) => c.table === "profiles" && c.op === "select" && c.orders.length > 0,
    );
    expect(read?.orders).toEqual([["created_at", false]]);
  });

  test("tenants 보기 권한이 없으면 tenant_name 은 null 이고 tenants 를 읽지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "view", TABLES);

    const r = await get();

    expect(r.status).toBe(200);
    const items = (r.body as { items: Record<string, unknown>[] }).items;
    expect(items.find((x) => x.id === MEMBER_ID)).toMatchObject({
      tenant_id: "t-1",
      tenant_name: null,
    });
    expect(kit.db.calls.some((c) => c.table === "tenants")).toBe(false);
  });

  test("tenants 권한 조회가 실패하면 null 로 흘리지 않고 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const perms = kit.state.rpc.fn_admin_effective_permissions;
    let n = 0;
    kit.state.rpc.fn_admin_effective_permissions = (args) =>
      ++n === 1
        ? (perms?.(args) ?? { data: [], error: null })
        : { data: null, error: { message: "boom" } };

    const r = await get();

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  test("members 권한이 없으면 403 이고 회원을 읽지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "none", TABLES);

    const r = await get();

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "FORBIDDEN" });
    expect(kit.db.calls.filter((c) => c.table !== "profiles")).toHaveLength(0);
  });

  test("다른 메뉴 권한만 있으면 403", async () => {
    seedMembersDbOther();
    const r = await get();
    expect(r.status).toBe(403);
  });

  test("읽기 오류는 500 INTERNAL_ERROR 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.db.errors.push({
      table: "program_access",
      op: "select",
      error: { code: "42501" },
    });

    const r = await get();

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  test("GET 이외의 메서드는 405", async () => {
    expect((await get("POST")).status).toBe(405);
  });
});

function seedMembersDbOther() {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "tenants", level: "edit" }],
    error: null,
  });
}
