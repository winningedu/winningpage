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
  kit.state.rpc.fn_teacher_set_status = () => ({
    data: "profile-t1",
    error: null,
  });
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
});
