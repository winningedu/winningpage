// GET /api/admin/members/:id/messages 계약 검증. 회원에게 간 알림톡과 문자 이력(최근 100건).

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

const route = { app, path: "/api/admin/members/:id/messages" };

const get = (id: string) => callRoute(route, { query: { id } });

const TABLES = {
  profiles: [{ id: MEMBER_ID, member_type: "student" }],
  alimtalk_send_logs: [
    { id: 1, profile_id: MEMBER_ID, sent_at: "2026-03-01T00:00:00Z" },
    { id: 2, profile_id: MEMBER_ID, sent_at: "2026-05-01T00:00:00Z" },
    { id: 3, profile_id: OTHER_ID, sent_at: "2026-06-01T00:00:00Z" },
  ],
};

beforeEach(() => {
  kit.state = createKitState();
  kit.db = seedMembersDb(kit.state, "view", TABLES);
});

describe("GET /api/admin/members/:id/messages", () => {
  test("그 회원의 이력을 최신순으로 100건까지 돌려준다", async () => {
    const r = await get(MEMBER_ID);

    expect(r.status).toBe(200);
    expect(
      (r.body as { items: { id: number }[] }).items.map((x) => x.id),
    ).toEqual([2, 1]);
    const read = kit.db.calls.find((c) => c.table === "alimtalk_send_logs");
    expect(read?.filters).toEqual([["profile_id", "eq", MEMBER_ID]]);
    expect(read?.orders).toEqual([["sent_at", false]]);
    expect(read?.limit).toBe(100);
  });

  test("members 권한이 없으면 403 이고 읽지 않는다", async () => {
    kit.db = seedMembersDb(kit.state, "none", TABLES);

    expect((await get(MEMBER_ID)).status).toBe(403);
    expect(kit.db.calls.some((c) => c.table === "alimtalk_send_logs")).toBe(
      false,
    );
  });

  test("없는 회원은 404 NOT_FOUND 이고 alimtalk_send_logs 를 읽지 않는다", async () => {
    const r = await get(OTHER_ID);

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
    expect(kit.db.calls.some((c) => c.table === "alimtalk_send_logs")).toBe(
      false,
    );
  });

  test("uuid 가 아닌 id 는 400 이고 읽지 않는다", async () => {
    const r = await get("x");

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(kit.db.calls.some((c) => c.table === "alimtalk_send_logs")).toBe(
      false,
    );
  });

  test("읽기 오류는 500 INTERNAL_ERROR", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.db.errors.push({
      table: "alimtalk_send_logs",
      op: "select",
      error: { code: "42501" },
    });

    const r = await get(MEMBER_ID);

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
