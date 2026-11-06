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
  signOut: vi.fn(),
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
  kit.signOut = vi.fn(async () => {
    kit.state.events.push("auth:signOut");
    return { error: null };
  });
  (kit.state.auth as Record<string, unknown>).signOut = kit.signOut;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/change-password", () => {
  test("새 비밀번호가 현재 비밀번호와 같으면 400 PASSWORD_SAME_AS_CURRENT 이고 로그인 시도와 변경을 하지 않는다", async () => {
    const r = await post({
      currentPassword: "SamePass123",
      newPassword: "SamePass123",
    });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      error: {
        code: "PASSWORD_SAME_AS_CURRENT",
        message: "현재 비밀번호와 다른 비밀번호를 입력해 주세요.",
      },
    });
    expect(kit.signIn).not.toHaveBeenCalled();
    expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
    expect(kit.state.events).not.toContain("rpc:fn_login_attempt_begin");
  });

  test("Auth 비밀번호를 바꾼 뒤 변경 시각 rpc 에 교사와 기관을 함께 넘기고 감사 로그보다 먼저 부른다", async () => {
    const calls: Record<string, unknown>[] = [];
    kit.state.rpc.fn_teacher_password_set = (args) => {
      calls.push(args);
      return { data: null, error: null };
    };

    const r = await post({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
    });

    expect(r.status).toBe(200);
    expect(calls).toEqual([
      { p_teacher_id: "teacher-1", p_tenant: "tenant-1" },
    ]);
    const events = kit.state.events;
    expect(events.indexOf("rpc:fn_teacher_password_set")).toBeGreaterThan(
      events.indexOf("auth:updateUserById"),
    );
    expect(events.indexOf("rpc:fn_teacher_password_set")).toBeLessThan(
      events.indexOf("insert:admin_access_logs"),
    );
  });

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

  test("비밀번호를 바꾼 뒤 새 세션만 남기고 나머지(이전 기기, 확인용 세션)를 모두 로그아웃시킨다", async () => {
    const r = await post({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
    });

    expect(r.status).toBe(200);
    expect(kit.signOut).toHaveBeenCalledTimes(1);
    expect(kit.signOut).toHaveBeenCalledWith(SESSION.access_token, "others");
    const events = kit.state.events.filter((e) => e !== "rpc:fn_console_actor");
    expect(events.indexOf("auth:signOut")).toBeGreaterThan(
      events.indexOf("auth:updateUserById"),
    );
  });

  test("다른 세션 로그아웃에 실패하면 새 세션을 돌려주지 않고 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.signOut.mockResolvedValue({ error: { message: "x" } });

    const r = await post({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
    });

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain(SESSION.refresh_token);
  });

  test("현재 비밀번호가 틀리면 로그인과 같은 401 INVALID 이고 실패 횟수가 늘며 비밀번호를 바꾸지 않는다", async () => {
    kit.signIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { status: 400 },
    });
    kit.state.rpc.fn_login_attempt_begin = () => ({
      data: [{ outcome: "proceed", attempt_no: 2, retry_after_s: 0 }],
      error: null,
    });
    const ended: Record<string, unknown>[] = [];
    kit.state.rpc.fn_login_attempt_end = (args) => {
      ended.push(args);
      return { data: null, error: null };
    };

    const r = await post({
      currentPassword: "Wrong1234",
      newPassword: "NewPass456",
    });

    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({
      error: { code: "INVALID" },
      failCount: 2,
    });
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({ p_outcome: "invalid" });
    expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
    expect(kit.state.inserts).toHaveLength(0);
  });

  test("잠긴 상태면 429 LOCKED 와 Retry-After 이고 GoTrue 를 부르지 않는다", async () => {
    kit.state.rpc.fn_login_attempt_begin = () => ({
      data: [{ outcome: "locked", attempt_no: 5, retry_after_s: 540 }],
      error: null,
    });

    const r = await post({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
    });

    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: { code: "LOCKED" } });
    expect(r.headers["Retry-After"]).toBe("540");
    expect(kit.signIn).not.toHaveBeenCalled();
    expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
  });

  test.each([
    ["8자 미만", "Ab1xyz", "PASSWORD_TOO_SHORT"],
    ["숫자 없음", "Abcdefghij", "PASSWORD_NO_DIGIT"],
    ["영문자 없음", "1234567890", "PASSWORD_NO_LETTER"],
  ])(
    "새 비밀번호가 %s 이면 400 이고 현재 비밀번호 확인(잠금 횟수)을 쓰지 않는다",
    async (_label, newPassword, code) => {
      const r = await post({ currentPassword: "OldPass123", newPassword });

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: { code } });
      expect(kit.state.events).not.toContain("rpc:fn_login_attempt_begin");
    },
  );

  test("본사 대행(교사 아님)은 403 FORBIDDEN", async () => {
    kit.state.actor = {
      ...kit.state.actor,
      kind: "hq_proxy",
      teacher_id: null,
      proxy_session_id: "session-1",
    };

    const r = await post({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
    });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  test("임시 비밀번호 상태의 계정은 403 MUST_CHANGE_PASSWORD(첫 비밀번호 라우트를 써야 한다)", async () => {
    kit.state.actor = { ...kit.state.actor, must_change_password: true };

    const r = await post({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
    });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "MUST_CHANGE_PASSWORD" } });
  });
});
