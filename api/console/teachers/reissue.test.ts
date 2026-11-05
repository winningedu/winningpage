// POST /api/console/teachers/reissue 계약 검증. 비밀번호 설정 전이고 마지막 발송이 실패한 계정에만 새 임시 비밀번호를 준다.

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

import handler from "./reissue.js";

const post = (body: unknown) => callHandler(handler, body);

const TEACHER = {
  id: "teacher-1",
  tenant_id: "tenant-1",
  login_id: "ABCD2345XY7Z9K",
  profile_id: "profile-t1",
  password_set_at: null as string | null,
  deleted_at: null as string | null,
  temp_password_issued_at: "2026-11-05T06:00:00Z",
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.teachers = () => ({ ...TEACHER });
  kit.state.rows.alimtalk_send_logs = () => [{ status: "failed" }];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/teachers/reissue", () => {
  test("새 임시 비밀번호의 해시를 저장한 뒤 Auth 비밀번호를 바꾸고 평문은 한 번만 돌려준다", async () => {
    let attachArgs: Record<string, unknown> = {};
    kit.state.rpc.fn_teacher_attach_account = (args) => {
      attachArgs = args;
      return { data: null, error: null };
    };

    const r = await post({ teacherId: "teacher-1" });

    expect(r.status).toBe(200);
    const password = (r.body as { tempPassword: string }).tempPassword;
    expect(password).toHaveLength(10);
    expect(attachArgs).toMatchObject({
      p_teacher_id: "teacher-1",
      p_profile_id: "profile-t1",
      p_login_id: "ABCD2345XY7Z9K",
    });
    expect(attachArgs.p_temp_hash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(attachArgs)).not.toContain(password);
    expect(kit.state.auth.updateUserById).toHaveBeenCalledWith("profile-t1", {
      password,
    });
    expect(
      kit.state.events.filter((e) => e !== "rpc:fn_console_actor"),
    ).toEqual([
      "rpc:fn_teacher_attach_account",
      "insert:admin_access_logs",
      "auth:updateUserById",
    ]);
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "account_reissue",
      target_id: "teacher-1",
      meta: {
        sendDedupeKey: "teacherIssue:teacher-1:2026-11-05T06:00:00Z",
      },
    });
    expect(JSON.stringify(kit.state.inserts)).not.toContain(password);
  });

  test("발송 기록이 아직 없으면 마지막 발송이 성공한 것이 아니므로 재발급할 수 있다", async () => {
    kit.state.rows.alimtalk_send_logs = () => [];

    expect((await post({ teacherId: "teacher-1" })).status).toBe(200);
  });

  test.each([
    [
      "비밀번호 설정이 끝난 계정",
      { password_set_at: "2026-11-05T07:00:00Z" },
      "PASSWORD_ALREADY_SET",
    ],
    ["계정이 없는 교사", { profile_id: null }, "NO_ACCOUNT"],
    ["다른 기관 교사", { tenant_id: "tenant-2" }, "NOT_FOUND"],
    ["삭제된 교사", { deleted_at: "2026-11-01" }, "NOT_FOUND"],
  ])(
    "%s 는 409 또는 404 이고 아무것도 바꾸지 않는다",
    async (_label, over, code) => {
      kit.state.rows.teachers = () => ({ ...TEACHER, ...over });

      const r = await post({ teacherId: "teacher-1" });

      expect([404, 409]).toContain(r.status);
      expect(r.body).toMatchObject({ error: { code } });
      expect(kit.state.events).not.toContain("rpc:fn_teacher_attach_account");
      expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
    },
  );

  test("알림톡을 아직 연결하지 않았으므로 발송 기록과 상관없이 재발급한다(결정 16)", async () => {
    kit.state.rows.alimtalk_send_logs = () => [{ status: "sent" }];

    const r = await post({ teacherId: "teacher-1" });

    expect(r.status).toBe(200);
    expect(kit.state.auth.updateUserById).toHaveBeenCalled();
  });

  test("Auth 비밀번호 교체가 실패하면 502 AUTH_SYNC_FAILED 이고 평문을 돌려주지 않는다", async () => {
    kit.state.auth.updateUserById.mockResolvedValue({
      data: null,
      error: { status: 500 },
    });

    const r = await post({ teacherId: "teacher-1" });

    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ error: { code: "AUTH_SYNC_FAILED" } });
    expect(JSON.stringify(r.body)).not.toContain("tempPassword");
  });

  test.each([
    ["WC089", "ACCOUNT_MISMATCH"],
    ["WC090", "PASSWORD_ALREADY_SET"],
  ])(
    "attach 가 %s 로 거부하면 409 %s 이고 Auth 비밀번호를 바꾸지 않는다",
    async (sqlstate, code) => {
      kit.state.rpc.fn_teacher_attach_account = () => ({
        data: null,
        error: { code: sqlstate },
      });

      const r = await post({ teacherId: "teacher-1" });

      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: { code } });
      expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
    },
  );

  test("교사 누락은 400, 담임은 403", async () => {
    expect((await post({})).status).toBe(400);

    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };
    expect((await post({ teacherId: "teacher-1" })).status).toBe(403);
  });
});
