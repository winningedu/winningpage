// POST /api/console/first-password 계약 검증(W2). 임시 비밀번호 상태의 계정만 쓸 수 있다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";
import { hashTempPassword } from "../_lib/console/teacherAccounts.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  signOut: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./first-password.js";

const post = (body: unknown) => callHandler(handler, body);

beforeEach(async () => {
  kit.state = createKitState();
  kit.state.actor = {
    kind: "homeroom",
    tenant_id: "tenant-1",
    teacher_id: "teacher-1",
    class_ids: ["class-1"],
    proxy_session_id: null,
    must_change_password: true,
  };
  kit.signOut = vi.fn(async () => {
    kit.state.events.push("auth:signOut");
    return { error: null };
  });
  (kit.state.auth as Record<string, unknown>).signOut = kit.signOut;
  const hash = await hashTempPassword("Temp#1234x");
  kit.state.rows.teachers = () => ({
    login_id: "ABCD2345XY7Z9K",
    temp_password_hash: hash,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/first-password", () => {
  test("임시 비밀번호 상태의 교사가 규칙에 맞는 비밀번호를 정하면 Auth 를 바꾸고 임시 상태를 지우고 감사 로그를 남긴다", async () => {
    const logs = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];

    const r = await post({ password: "NewPass123" });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(kit.state.auth.updateUserById).toHaveBeenCalledWith("profile-1", {
      password: "NewPass123",
    });
    expect(
      kit.state.events.filter((e) => e !== "rpc:fn_console_actor"),
    ).toEqual([
      "auth:updateUserById",
      "auth:signOut",
      "rpc:fn_teacher_password_set",
      "insert:admin_access_logs",
    ]);
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "password_set",
      target_id: "teacher-1",
    });
    expect(JSON.stringify(kit.state.inserts)).not.toContain("NewPass123");
    for (const spy of logs) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain("NewPass123");
    }
  });

  test("임시 비밀번호로 연 현재 세션만 남기고 다른 세션은 로그아웃시킨다", async () => {
    await post({ password: "NewPass123" });

    expect(kit.signOut).toHaveBeenCalledWith("token", "others");
  });

  test("다른 세션 로그아웃에 실패하면 502 이고 임시 상태를 풀지 않아 같은 요청을 다시 보낼 수 있다", async () => {
    kit.signOut.mockResolvedValue({ error: { message: "x" } });

    const r = await post({ password: "NewPass123" });

    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ error: { code: "AUTH_SYNC_FAILED" } });
    expect(kit.state.events).not.toContain("rpc:fn_teacher_password_set");
  });

  test.each([
    ["8자 미만", "Ab1xyz", "PASSWORD_TOO_SHORT"],
    ["숫자 없음", "Abcdefghij", "PASSWORD_NO_DIGIT"],
    ["영문자 없음", "1234567890", "PASSWORD_NO_LETTER"],
    ["임시 비밀번호와 같음", "Temp#1234x", "PASSWORD_SAME_AS_TEMP"],
  ])(
    "%s 이면 400 %s 이고 Auth 와 DB 를 바꾸지 않는다",
    async (_label, password, code) => {
      const r = await post({ password });

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: { code } });
      expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
      expect(kit.state.events).not.toContain("rpc:fn_teacher_password_set");
    },
  );

  test("비밀번호가 없거나 문자열이 아니면 400 BAD_REQUEST", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ password: 12345678 })).status).toBe(400);
  });

  test("임시 비밀번호 상태가 아닌 교사는 409 NOT_REQUIRED", async () => {
    kit.state.actor = { ...kit.state.actor, must_change_password: false };

    const r = await post({ password: "NewPass123" });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "NOT_REQUIRED" } });
    expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
  });

  test("본사 대행(교사 아님)은 403 FORBIDDEN", async () => {
    kit.state.actor = {
      ...kit.state.actor,
      kind: "hq_proxy",
      teacher_id: null,
      proxy_session_id: "session-1",
      must_change_password: false,
    };

    const r = await post({ password: "NewPass123" });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  test("Auth 교체가 실패하면 502 이고 DB 임시 상태는 그대로다", async () => {
    kit.state.auth.updateUserById.mockResolvedValue({
      data: null,
      error: { status: 500 },
    });

    const r = await post({ password: "NewPass123" });

    expect(r.status).toBe(502);
    expect(kit.state.events).not.toContain("rpc:fn_teacher_password_set");
    expect(kit.state.inserts).toHaveLength(0);
  });
});
