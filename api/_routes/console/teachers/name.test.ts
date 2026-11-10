// PATCH /api/console/teachers/name 계약 검증. 이름만 바꾸고 로그인 아이디는 건드리지 않는다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./name.js";

const patch = (body: unknown) => callHandler(handler, body, "PATCH");

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.teachers = () => [
    {
      id: "teacher-1",
      tenant_id: "tenant-1",
      profile_id: "profile-t1",
      deleted_at: null,
    },
  ];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PATCH /api/console/teachers/name", () => {
  test("이름만 바꾸고(앞뒤 공백 제거) 계정 프로필 이름도 맞추며 로그인 아이디는 건드리지 않는다", async () => {
    const r = await patch({ teacherId: "teacher-1", name: " 김새이름 " });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    const teacherUpdate = kit.state.updates.find((u) => u.table === "teachers");
    expect(teacherUpdate).toEqual({
      table: "teachers",
      values: { name: "김새이름" },
      filters: { id: "teacher-1", tenant_id: "tenant-1" },
    });
    expect(kit.state.updates.find((u) => u.table === "profiles")).toMatchObject(
      { values: { name: "김새이름" }, filters: { id: "profile-t1" } },
    );
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "update",
      target_id: "teacher-1",
      meta: { field: "name" },
    });
  });

  test("다른 기관 교사는 404 이고 아무것도 바꾸지 않는다", async () => {
    kit.state.rows.teachers = () => [
      {
        id: "teacher-1",
        tenant_id: "tenant-2",
        profile_id: null,
        deleted_at: null,
      },
    ];

    const r = await patch({ teacherId: "teacher-1", name: "김새이름" });

    expect(r.status).toBe(404);
    expect(kit.state.updates).toHaveLength(0);
  });

  test.each([
    ["빈 이름", { teacherId: "teacher-1", name: "  " }],
    ["교사 누락", { name: "김새이름" }],
  ])("%s 이면 400", async (_label, body) => {
    expect((await patch(body)).status).toBe(400);
    expect(kit.state.updates).toHaveLength(0);
  });

  test("담임은 403 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    expect(
      (await patch({ teacherId: "teacher-1", name: "김새이름" })).status,
    ).toBe(403);
  });
});
