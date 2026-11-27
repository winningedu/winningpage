// GET /api/admin/members/:id/orders 계약 검증. 학생으로 또는 학부모로 걸린 주문.

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

const route = { app, path: "/api/admin/members/:id/orders" };

const get = (id: string) => callRoute(route, { query: { id } });

const TABLES = {
  profiles: [{ id: MEMBER_ID, member_type: "parent" }],
  orders: [
    {
      id: "o-1",
      created_at: "2026-03-01T00:00:00Z",
      parent_profile_id: MEMBER_ID,
    },
    {
      id: "o-2",
      created_at: "2026-05-01T00:00:00Z",
      student_profile_id: MEMBER_ID,
    },
  ],
};

beforeEach(() => {
  kit.state = createKitState();
  kit.db = seedMembersDb(kit.state, "view", TABLES);
});

describe("GET /api/admin/members/:id/orders", () => {
  test("학생 축과 학부모 축을 OR 로 걸어 최신순으로 돌려준다", async () => {
    const r = await get(MEMBER_ID);

    expect(r.status).toBe(200);
    expect(
      (r.body as { items: { id: string }[] }).items.map((x) => x.id),
    ).toEqual(["o-2", "o-1"]);
    const read = kit.db.calls.find((c) => c.table === "orders");
    expect(read?.or).toBe(
      `student_profile_id.eq.${MEMBER_ID},parent_profile_id.eq.${MEMBER_ID}`,
    );
    expect(read?.orders).toEqual([["created_at", false]]);
  });

  test("필터 문자열을 깨는 id 는 400 이고 주문을 읽지 않는다", async () => {
    // 루트 앱은 "%" 가 든 경로를 라우트 전에 404 로 막으므로, 쉼표와 점은 인코딩하지 않은 그대로 보낸다.
    const r = await callRoute({
      app,
      path: "/api/admin/members/x,parent_profile_id.neq.0/orders",
    });

    expect(r.status).toBe(400);
    expect(kit.db.calls.some((c) => c.table === "orders")).toBe(false);
  });

  test("members 권한이 없으면 403 이고 읽지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "none", TABLES);

    expect((await get(MEMBER_ID)).status).toBe(403);
    expect(kit.db.calls.some((c) => c.table === "orders")).toBe(false);
  });

  test("없는 회원은 404 NOT_FOUND 이고 orders 를 읽지 않는다", async () => {
    const r = await get(OTHER_ID);

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
    expect(kit.db.calls.some((c) => c.table === "orders")).toBe(false);
  });

  test("uuid 가 아닌 id 는 400 이고 읽지 않는다", async () => {
    const r = await get("x");

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(kit.db.calls.some((c) => c.table === "orders")).toBe(false);
  });

  test("읽기 오류는 500 INTERNAL_ERROR", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.db.errors.push({
      table: "orders",
      op: "select",
      error: { code: "42501" },
    });

    const r = await get(MEMBER_ID);

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
