// POST /api/console/teachers/delete 계약 검증. DB 삭제를 먼저 커밋하고 Auth 사용자 삭제는 그 뒤에 한다.

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
      p_tenant: "tenant-1",
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

  test("하나라도 다른 기관 교사면 404 이고 아무도 지우지 않는다", async () => {
    kit.state.rows.teachers = () => [
      ROWS[0],
      { id: "t2", tenant_id: "tenant-2", profile_id: null, deleted_at: null },
    ];

    const r = await post({ teacherIds: ["t1", "t2"] });

    expect(r.status).toBe(404);
    expect(kit.state.events).not.toContain("rpc:fn_teacher_soft_delete");
  });

  test("마지막 학교 관리자가 끼면 409 LAST_SCHOOL_ADMIN 이고 Auth 를 지우지 않는다", async () => {
    kit.state.rpc.fn_teacher_soft_delete = () => ({
      data: null,
      error: { code: "WC076" },
    });

    const r = await post({ teacherIds: ["t1"] });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "LAST_SCHOOL_ADMIN" } });
    expect(kit.state.auth.deleteUser).not.toHaveBeenCalled();
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("Auth 삭제가 실패하면 502 AUTH_SYNC_FAILED 이고 DB 삭제와 감사 로그는 남는다", async () => {
    kit.state.auth.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 500 },
    });

    const r = await post({ teacherIds: ["t1"] });

    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ error: { code: "AUTH_SYNC_FAILED" } });
    expect(kit.state.inserts).toHaveLength(1);
  });

  test("재시도에서 Auth 사용자가 이미 없으면(user_not_found) 성공으로 본다", async () => {
    kit.state.auth.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 404, code: "user_not_found" },
    });

    expect((await post({ teacherIds: ["t1"] })).status).toBe(200);
  });

  test.each([
    ["빈 배열", { teacherIds: [] }],
    ["배열이 아님", { teacherIds: "t1" }],
    ["문자열이 아닌 id", { teacherIds: [1] }],
  ])("%s 이면 400", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(kit.state.events).not.toContain("rpc:fn_teacher_soft_delete");
  });

  test("담임은 403 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    expect((await post({ teacherIds: ["t1"] })).status).toBe(403);
  });
});
