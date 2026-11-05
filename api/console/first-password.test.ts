// POST /api/console/first-password 계약 검증(W2). 임시 비밀번호 상태의 계정만 쓸 수 있다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../_lib/console/consoleTestKit.js";
import { hashTempPassword } from "../_lib/console/teacherAccounts.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

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
});
