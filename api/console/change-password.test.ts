// POST /api/console/change-password 계약 검증(W18a). 현재 비밀번호 확인은 로그인 잠금 횟수에 포함된다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  signIn: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "env-value",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: kit.signIn } }),
}));

import handler from "./change-password.js";

const post = (body: unknown) => callHandler(handler, body);

const SESSION = {
  access_token: "access",
  refresh_token: "refresh",
  expires_at: 1790000000,
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.actor = {
    kind: "homeroom",
    tenant_id: "tenant-1",
    teacher_id: "teacher-1",
    class_ids: ["class-1"],
    proxy_session_id: null,
    must_change_password: false,
  };
  kit.state.rows.teachers = () => ({
    login_id: "ABCD2345XY7Z9K",
    must_change_password: false,
  });
  kit.state.rows.profiles = () => ({ member_type: "teacher" });
  kit.state.rpc.fn_login_attempt_begin = () => ({
    data: [{ outcome: "proceed", attempt_no: 1, retry_after_s: 0 }],
    error: null,
  });
  kit.signIn.mockReset();
  kit.signIn.mockResolvedValue({
    data: { user: { id: "profile-1" }, session: SESSION },
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/change-password", () => {
  test("현재 비밀번호를 확인하고 Auth 비밀번호를 바꾼 뒤 새 비밀번호로 만든 세션을 돌려준다", async () => {
    const r = await post({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, session: SESSION });
    expect(kit.signIn).toHaveBeenNthCalledWith(1, {
      email: "abcd2345xy7z9k@teacher.schoolmentor.kr",
      password: "OldPass123",
    });
    expect(kit.state.auth.updateUserById).toHaveBeenCalledWith("profile-1", {
      password: "NewPass456",
    });
    expect(kit.signIn).toHaveBeenNthCalledWith(2, {
      email: "abcd2345xy7z9k@teacher.schoolmentor.kr",
      password: "NewPass456",
    });
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "password_set",
      target_id: "teacher-1",
      meta: { kind: "change" },
    });
    const logged = JSON.stringify(kit.state.inserts);
    expect(logged).not.toContain("OldPass123");
    expect(logged).not.toContain("NewPass456");
  });
});
