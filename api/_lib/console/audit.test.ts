// 콘솔 감사 로그 적재 계약 검증(admin_access_logs).

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import type { ConsoleActor } from "./actor.js";
import { writeConsoleAuditLog } from "./audit.js";

const TEACHER: ConsoleActor = {
  kind: "homeroom",
  tenantId: "tenant-1",
  teacherId: "teacher-1",
  classIds: ["class-1"],
  proxySessionId: null,
  mustChangePassword: false,
  loginId: "kim01",
};

function makeCtx(
  actor: ConsoleActor,
  insertResult: { error: unknown } = { error: null },
) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return {
    insert,
    from,
    ctx: {
      supabaseAdmin: { from } as unknown as SupabaseClient,
      userId: "profile-1",
      user: { email: "hq@example.com" } as User,
      console: actor,
    },
  };
}

describe("writeConsoleAuditLog", () => {
  test("교사 행위는 기관, 행위자 종류, 로그인 아이디, 교사 id 를 채워 적재한다", async () => {
    const { ctx, insert, from } = makeCtx(TEACHER);

    await writeConsoleAuditLog(ctx, {
      action: "update",
      resourceKey: "console.students",
      targetId: "student-1",
      rowCount: 1,
    });

    expect(from).toHaveBeenCalledWith("admin_access_logs");
    expect(insert).toHaveBeenCalledWith({
      profile_id: "profile-1",
      actor_email: null,
      tenant_id: "tenant-1",
      actor_kind: "teacher",
      actor_login_id: "kim01",
      teacher_id: "teacher-1",
      proxy_session_id: null,
      action: "update",
      resource_key: "console.students",
      reason: null,
      row_count: 1,
      target_id: "student-1",
      meta: {},
    });
  });

  test("학교 관리자는 actor_kind school_admin 으로 남는다", async () => {
    const { ctx, insert } = makeCtx({ ...TEACHER, kind: "school_admin" });

    await writeConsoleAuditLog(ctx, { action: "view", resourceKey: "k" });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_kind: "school_admin" }),
    );
  });

  test("본사 대행은 대행 세션 id 와 본사 이메일을 남기고 로그인 아이디는 비운다", async () => {
    const { ctx, insert } = makeCtx({
      ...TEACHER,
      kind: "hq_proxy",
      teacherId: null,
      loginId: null,
      proxySessionId: "proxy-1",
    });

    await writeConsoleAuditLog(ctx, { action: "view", resourceKey: "k" });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_kind: "hq_proxy",
        actor_email: "hq@example.com",
        actor_login_id: null,
        teacher_id: null,
        proxy_session_id: "proxy-1",
      }),
    );
  });

  test("meta 에서 비밀번호 키는 중첩까지 제거한다", async () => {
    const { ctx, insert } = makeCtx(TEACHER);

    await writeConsoleAuditLog(ctx, {
      action: "account_issue",
      resourceKey: "k",
      meta: {
        classes: 2,
        tempPassword: "Abc123!@#x",
        nested: { temp_password: "zzz", keep: "v" },
        list: [{ password: "p", ok: 1 }],
      },
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: { classes: 2, nested: { keep: "v" }, list: [{ ok: 1 }] },
      }),
    );
  });

  test("적재가 실패하면 예외를 던져 라우트를 실패시킨다", async () => {
    const { ctx } = makeCtx(TEACHER, { error: { code: "23514" } });

    await expect(
      writeConsoleAuditLog(ctx, { action: "update", resourceKey: "k" }),
    ).rejects.toThrow("console audit log write failed");
  });
});
