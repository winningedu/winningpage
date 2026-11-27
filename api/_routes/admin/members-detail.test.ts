// GET, PATCH /api/admin/members/:id 계약 검증. 서비스 롤로 쓰는 것은 member_category 와 guardian_phone 둘뿐이다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSectionAdmin,
  type SectionDb,
} from "../../_lib/admin-sections/sectionTestKit.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";
import {
  MEMBER_ID,
  OTHER_ID,
  seedMembersDb,
} from "../../_lib/members/membersTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as SectionDb,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createSectionAdmin(kit.state, kit.db),
}));

import { app } from "../app.js";

const route = { app, path: "/api/admin/members/:id" };

const call = (method: string, id: string, body?: unknown) =>
  callRoute(route, { method, query: { id }, body });

const TABLES = {
  profiles: [
    {
      id: MEMBER_ID,
      name: "가 학생",
      tenant_id: "t-1",
      member_category: "일반",
      guardian_phone: "01011112222",
      role: "student",
    },
  ],
  tenants: [{ id: "t-1", name: "한빛 학원" }],
};

const writes = () => kit.db.calls.filter((c) => c.op !== "select");

beforeEach(() => {
  kit.state = createKitState();
  kit.db = seedMembersDb(kit.state, "edit", TABLES, "view");
});

describe("GET /api/admin/members/:id", () => {
  test("view 권한이면 회원 한 명에 소속 이름을 얹어 돌려준다", async () => {
    kit.db = seedMembersDb(kit.state, "view", TABLES, "view");

    const r = await call("GET", MEMBER_ID);

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: MEMBER_ID,
      name: "가 학생",
      tenant_name: "한빛 학원",
    });
  });

  test("tenants 보기 권한이 없으면 tenant_name 은 null 이고 tenants 를 읽지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "view", TABLES);
    const r = await call("GET", MEMBER_ID);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tenant_id: "t-1", tenant_name: null });
    expect(kit.db.calls.some((c) => c.table === "tenants")).toBe(false);
  });

  test("tenants 권한 조회가 실패하면 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const perms = kit.state.rpc.fn_admin_effective_permissions;
    let n = 0;
    kit.state.rpc.fn_admin_effective_permissions = (args) =>
      ++n === 1
        ? (perms?.(args) ?? { data: [], error: null })
        : { data: null, error: { message: "boom" } };
    const r = await call("GET", MEMBER_ID);
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  test("소속이 없으면 tenant_name 은 빈 문자열", async () => {
    kit.db = seedMembersDb(
      kit.state,
      "view",
      { ...TABLES, profiles: [{ id: OTHER_ID, tenant_id: null }] },
      "view",
    );

    const r = await call("GET", OTHER_ID);

    expect(r.body).toMatchObject({ id: OTHER_ID, tenant_name: "" });
  });

  test("없는 회원은 404 NOT_FOUND", async () => {
    const r = await call("GET", OTHER_ID);

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      code: "NOT_FOUND",
      detail: "회원을 찾을 수 없습니다.",
    });
  });

  test("uuid 가 아닌 id 는 400 이고 읽지 않는다", async () => {
    const r = await call("GET", "not-a-uuid");

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(
      kit.db.calls.some(
        (c) =>
          c.filters.length > 0 &&
          c.table === "profiles" &&
          c.filters[0]?.[1] === "eq" &&
          c.filters[0]?.[2] === "not-a-uuid",
      ),
    ).toBe(false);
  });

  test("members 권한이 없으면 403", async () => {
    kit.db = seedMembersDb(kit.state, "none", TABLES);

    expect((await call("GET", MEMBER_ID)).status).toBe(403);
  });
});

describe("PATCH /api/admin/members/:id", () => {
  test("edit 권한이면 두 열만 고치고 고친 회원을 돌려준다(공백은 다듬고 빈 값은 null)", async () => {
    const r = await call("PATCH", MEMBER_ID, {
      member_category: "  VIP ",
      guardian_phone: "",
    });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      id: MEMBER_ID,
      member_category: "VIP",
      guardian_phone: null,
      tenant_name: "한빛 학원",
    });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({
      table: "profiles",
      op: "update",
      values: { member_category: "VIP", guardian_phone: null },
      filters: [["id", "eq", MEMBER_ID]],
    });
  });

  test("tenants 보기 권한이 없으면 PATCH 응답의 tenant_name 도 null 이다", async () => {
    kit.db = seedMembersDb(kit.state, "edit", TABLES);
    const r = await call("PATCH", MEMBER_ID, { member_category: "VIP" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ member_category: "VIP", tenant_name: null });
    expect(kit.db.calls.some((c) => c.table === "tenants")).toBe(false);
  });

  test("한 열만 보내면 그 열만 쓴다", async () => {
    await call("PATCH", MEMBER_ID, { guardian_phone: "01099998888" });

    expect(writes()[0]?.values).toEqual({ guardian_phone: "01099998888" });
  });

  test("view 권한만 있으면 403 이고 쓰지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "view", TABLES);

    const r = await call("PATCH", MEMBER_ID, { member_category: "VIP" });

    expect(r.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test("권한이 없으면 403 이고 쓰지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "none", TABLES);

    expect(
      (await call("PATCH", MEMBER_ID, { member_category: "VIP" })).status,
    ).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  test.each([
    ["다른 열(role)", { role: "admin" }],
    ["허용 열과 다른 열", { member_category: "VIP", tenant_id: "t-2" }],
    ["빈 본문", {}],
    ["본문 없음", undefined],
    ["문자열이 아닌 값", { member_category: 3 }],
  ])("%s 이면 400 이고 쓰지 않는다", async (_label, body) => {
    const r = await call("PATCH", MEMBER_ID, body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(writes()).toHaveLength(0);
  });

  test("uuid 가 아닌 id 는 400 이고 쓰지 않는다", async () => {
    const r = await call("PATCH", "x", { member_category: "VIP" });

    expect(r.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });

  test("맞는 행이 없으면 404 이다(0행 갱신)", async () => {
    const r = await call("PATCH", OTHER_ID, { member_category: "VIP" });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
  });

  test("쓰기 오류는 500 INTERNAL_ERROR", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.db.errors.push({
      table: "profiles",
      op: "update",
      error: { code: "23514" },
    });

    const r = await call("PATCH", MEMBER_ID, { member_category: "VIP" });

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

describe("메서드와 경로", () => {
  test.each([
    ["/api/admin/members/:id", "GET, HEAD, PATCH"],
    ["/api/admin/members/:id/tenant", "PUT"],
    ["/api/admin/members/:id/links", "GET, HEAD"],
    ["/api/admin/members/:id/messages", "GET, HEAD"],
    ["/api/admin/members/:id/orders", "GET, HEAD"],
    ["/api/admin/members/:id/services", "GET, HEAD"],
  ])("%s 에 맞지 않는 메서드는 405 와 Allow(%s) 다", async (path, allow) => {
    const r = await callRoute(
      { app, path },
      { method: "DELETE", query: { id: MEMBER_ID } },
    );

    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe(allow);
    expect(r.body).toMatchObject({ code: "METHOD_NOT_ALLOWED" });
  });

  test("목록 경로와 회원 경로는 서로 다른 핸들러에 닿는다", async () => {
    const list = await callRoute({ app, path: "/api/admin/members" });
    const one = await call("GET", MEMBER_ID);

    expect((list.body as { items?: unknown }).items).toBeDefined();
    expect((one.body as { id?: string }).id).toBe(MEMBER_ID);
  });

  test("모르는 하위 경로는 problem 404 다", async () => {
    const r = await callRoute({
      app,
      path: `/api/admin/members/${MEMBER_ID}/unknown`,
    });

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
  });

  test("HEAD 는 GET 처럼 권한을 보고 본문 없이 200 이다", async () => {
    const r = await call("HEAD", MEMBER_ID);

    expect(r.status).toBe(200);
  });
});
