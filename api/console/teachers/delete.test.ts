// POST /api/console/teachers/delete 계약 검증. DB 삭제를 먼저 커밋하고 Auth 사용자 삭제는 그 뒤에 한다.

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

import handler from "./delete.js";

const post = (body: unknown) => callHandler(handler, body);

const ROWS = [
  { id: "t1", tenant_id: "tenant-1", profile_id: "p1", deleted_at: null },
  { id: "t2", tenant_id: "tenant-1", profile_id: null, deleted_at: null },
];

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.teachers = () => ROWS;
  kit.state.rpc.fn_teacher_soft_delete = () => ({
    data: [
      { teacher_id: "t1", profile_id: "p1", active_students: 25 },
      { teacher_id: "t2", profile_id: null, active_students: 3 },
    ],
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/teachers/delete", () => {
  test("여러 명을 지우고 재학생 수를 돌려주며 DB, 감사 로그, Auth 삭제 순서로 처리한다", async () => {
    let args: Record<string, unknown> = {};
    kit.state.rpc.fn_teacher_soft_delete = (a) => {
      args = a;
      return {
        data: [
          { teacher_id: "t1", profile_id: "p1", active_students: 25 },
          { teacher_id: "t2", profile_id: null, active_students: 3 },
        ],
        error: null,
      };
    };

    const r = await post({ teacherIds: ["t1", "t2"] });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, deleted: 2, activeStudents: 28 });
    expect(args).toEqual({
      p_teacher_ids: ["t1", "t2"],
      p_actor: "profile-1",
    });
    expect(
      kit.state.events.filter((e) => e !== "rpc:fn_console_actor"),
    ).toEqual([
      "rpc:fn_teacher_soft_delete",
      "insert:admin_access_logs",
      "auth:deleteUser",
    ]);
    expect(kit.state.auth.deleteUser).toHaveBeenCalledTimes(1);
    expect(kit.state.auth.deleteUser).toHaveBeenCalledWith("p1");
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "account_delete",
      row_count: 2,
      meta: { teacherIds: ["t1", "t2"], activeStudents: 28 },
    });
  });
});
