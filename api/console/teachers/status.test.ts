// POST /api/console/teachers/status 계약 검증(활성, 비활성). Auth 정지는 DB 커밋 뒤에 한다.

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

import handler from "./status.js";

const post = (body: unknown) => callHandler(handler, body);

let setStatusArgs: Record<string, unknown> = {};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.teachers = (filters) =>
    filters.id === "teacher-1" || Array.isArray(filters.id)
      ? [
          {
            id: "teacher-1",
            tenant_id: "tenant-1",
            profile_id: "profile-t1",
            deleted_at: null,
          },
        ]
      : [];
  kit.state.rpc.fn_teacher_set_status = (a) => {
    setStatusArgs = a;
    return { data: "profile-t1", error: null };
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/teachers/status", () => {
  test("비활성화는 DB 를 먼저 커밋한 뒤 Auth 사용자를 정지하고 감사 로그를 남긴다", async () => {
    const r = await post({ teacherId: "teacher-1", status: "inactive" });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(
      kit.state.events.filter((e) => e !== "rpc:fn_console_actor"),
    ).toEqual([
      "rpc:fn_teacher_set_status",
      "insert:admin_access_logs",
      "auth:updateUserById",
    ]);
    expect(setStatusArgs).toEqual({
      p_teacher_id: "teacher-1",
      p_status: "inactive",
      p_actor: "profile-1",
      p_tenant: "tenant-1",
    });
    expect(kit.state.auth.updateUserById).toHaveBeenCalledWith("profile-t1", {
      ban_duration: "876000h",
    });
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "account_status",
      target_id: "teacher-1",
      tenant_id: "tenant-1",
      meta: { status: "inactive" },
    });
  });

  test("활성화는 Auth 정지를 해제한다", async () => {
    const r = await post({ teacherId: "teacher-1", status: "active" });

    expect(r.status).toBe(200);
    expect(kit.state.auth.updateUserById).toHaveBeenCalledWith("profile-t1", {
      ban_duration: "none",
    });
  });

  test("본인 비활성화는 409 SELF_CHANGE 이고 Auth 를 건드리지 않으며 감사 로그도 없다", async () => {
    kit.state.rpc.fn_teacher_set_status = () => ({
      data: null,
      error: { code: "WC091" },
    });

    const r = await post({ teacherId: "teacher-1", status: "inactive" });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "SELF_CHANGE" } });
    expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("마지막 학교 관리자는 409 LAST_SCHOOL_ADMIN", async () => {
    kit.state.rpc.fn_teacher_set_status = () => ({
      data: null,
      error: { code: "WC076" },
    });

    const r = await post({ teacherId: "teacher-1", status: "inactive" });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "LAST_SCHOOL_ADMIN" } });
  });

  test("계정이 없는 교사는 Auth 호출 없이 성공한다", async () => {
    kit.state.rpc.fn_teacher_set_status = () => ({ data: null, error: null });

    const r = await post({ teacherId: "teacher-1", status: "inactive" });

    expect(r.status).toBe(200);
    expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
  });

  test("다른 기관이나 없는 교사는 404 이고 DB 를 바꾸지 않는다", async () => {
    kit.state.rows.teachers = () => [
      {
        id: "teacher-1",
        tenant_id: "tenant-2",
        profile_id: null,
        deleted_at: null,
      },
    ];

    const r = await post({ teacherId: "teacher-1", status: "inactive" });

    expect(r.status).toBe(404);
    expect(kit.state.events).not.toContain("rpc:fn_teacher_set_status");
  });

  test("Auth 정지가 실패하면 502 AUTH_SYNC_FAILED 이고 DB 변경과 감사 로그는 남는다(같은 요청으로 재시도)", async () => {
    kit.state.auth.updateUserById.mockResolvedValue({
      data: null,
      error: { status: 500 },
    });

    const r = await post({ teacherId: "teacher-1", status: "inactive" });

    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ error: { code: "AUTH_SYNC_FAILED" } });
    expect(kit.state.inserts).toHaveLength(1);
  });

  test.each([
    ["상태 값 오류", { teacherId: "teacher-1", status: "gone" }],
    ["교사 누락", { status: "inactive" }],
  ])("%s 이면 400", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
  });

  test("담임은 403 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    expect(
      (await post({ teacherId: "teacher-1", status: "inactive" })).status,
    ).toBe(403);
  });
});
