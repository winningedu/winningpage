// POST /api/console/teachers/assignments 계약 검증(W16a). 담당 학급을 더하고, 지우고, 주담당을 정한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./assignments.js";

const post = (body: unknown) => callHandler(handler, body);

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.teachers = () => [
    {
      id: "teacher-1",
      tenant_id: "tenant-1",
      profile_id: null,
      deleted_at: null,
    },
  ];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/teachers/assignments", () => {
  test("더할 학급, 지울 학급, 주담당을 fn_assignment_set 에 넘기고 감사 로그를 남긴다", async () => {
    let args: Record<string, unknown> = {};
    kit.state.rpc.fn_assignment_set = (a) => {
      args = a;
      return { data: null, error: null };
    };

    const r = await post({
      teacherId: "teacher-1",
      add: [{ grade: "고1", name: "3반", groupId: "group-1" }],
      removeClassIds: ["class-9"],
      primaryClassId: "class-2",
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(args).toEqual({
      p_teacher_id: "teacher-1",
      p_add: [{ grade: "고1", name: "3반", group_id: "group-1" }],
      p_remove_class_ids: ["class-9"],
      p_primary: "class-2",
    });
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "update",
      resource_key: "console.teacher_assignments",
      target_id: "teacher-1",
      meta: { added: 1, removed: 1, primaryClassId: "class-2" },
    });
  });
});
