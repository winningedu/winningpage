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
});
