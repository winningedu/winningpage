// 임시 비밀번호 재발송 규칙(결정 16, 사 #148) 검증. 발송 기록을 보는지는 sendLogWired 로 가른다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ConsoleActor } from "./actor.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "./consoleTestKit.js";
import { reissueTeacherAccount } from "./teacherManage.js";

const kit = { state: null as unknown as KitState };

const ACTOR: ConsoleActor = {
  kind: "school_admin",
  tenantId: "tenant-1",
  teacherId: "admin-teacher-1",
  classIds: [],
  proxySessionId: null,
  mustChangePassword: false,
  loginId: "ADMINLOGIN0001",
};

function ctx() {
  return {
    supabaseAdmin: createFakeAdmin(kit.state) as never,
    userId: "profile-1",
    console: ACTOR,
  };
}

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.teachers = () => ({
    tenant_id: "tenant-1",
    login_id: "ABCD2345XY7Z9K",
    profile_id: "profile-t1",
    password_set_at: null,
    deleted_at: null,
    temp_password_issued_at: "2026-11-05T06:00:00Z",
  });
  vi.restoreAllMocks();
});

describe("reissueTeacherAccount send rule", () => {
  test("알림톡을 아직 연결하지 않았으면 발송 기록과 상관없이 비밀번호 미설정 교사는 재발송할 수 있다", async () => {
    kit.state.rows.alimtalk_send_logs = () => [{ status: "sent" }];

    const result = await reissueTeacherAccount(ctx(), "teacher-1", {
      sendLogWired: false,
    });

    expect(result.status).toBe("reissued");
  });

  test("알림톡을 연결한 뒤에는 마지막 발송이 실패일 때만 재발송할 수 있다", async () => {
    kit.state.rows.alimtalk_send_logs = () => [{ status: "failed" }];
    expect(
      (await reissueTeacherAccount(ctx(), "teacher-1", { sendLogWired: true }))
        .status,
    ).toBe("reissued");

    kit.state.rows.alimtalk_send_logs = () => [{ status: "sent" }];
    expect(
      (await reissueTeacherAccount(ctx(), "teacher-1", { sendLogWired: true }))
        .status,
    ).toBe("send_not_failed");
  });

  test("알림톡을 연결한 뒤 발송 기록이 없으면 실패한 발송이 아니므로 거부한다", async () => {
    kit.state.rows.alimtalk_send_logs = () => [];

    const result = await reissueTeacherAccount(ctx(), "teacher-1", {
      sendLogWired: true,
    });

    expect(result.status).toBe("send_not_failed");
  });
});
