// 선생님 계정 안내 알림톡(A5). 발급과 재발급 뒤에 보내고, 발송 결과는 발급을 막지 않는다.

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendAndLog: vi.fn() }));
vi.mock("../messaging/alimtalkSend.js", () => ({
  sendAndLog: mocks.sendAndLog,
}));

import type { ConsoleActor } from "./actor.js";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "./consoleTestKit.js";
import {
  issueAccountForExistingTeacher,
  registerResponseBody,
  registerTeacherWithAccount,
} from "./teacherAccounts.js";
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
  readOnly: false,
};

const TEACHER = {
  id: "teacher-1",
  tenant_id: "tenant-1",
  name: "김선생",
  phone: "01012345678",
  role: "homeroom",
  login_id: "ABCD2345XY7Z9K",
  profile_id: null as string | null,
  password_set_at: null,
  deleted_at: null,
  temp_password_issued_at: "2026-11-26T01:00:00Z",
};

function ctx() {
  return {
    supabaseAdmin: createFakeAdmin(kit.state) as never,
    userId: "profile-1",
    console: ACTOR,
  };
}

function input(role: "homeroom" | "school_admin" = "homeroom") {
  return {
    tenantId: "tenant-1",
    name: "김선생",
    phone: "01012345678",
    role,
    classes: [],
  };
}

let teacher: typeof TEACHER;

beforeEach(() => {
  mocks.sendAndLog.mockReset();
  mocks.sendAndLog.mockImplementation(async () => {
    kit.state.events.push("send:teacherAccount");
    return { status: "sent", logId: 7 };
  });
  kit.state = createKitState();
  teacher = { ...TEACHER };
  kit.state.rows.teachers = () => teacher;
  kit.state.rows.tenants = () => ({ name: "위닝고등학교" });
  kit.state.rpc.fn_teacher_register = () => ({
    data: [{ teacher_id: "teacher-1", verdict: "created" }],
    error: null,
  });
  kit.state.rpc.fn_teacher_attach_account = (args) => {
    teacher = { ...teacher, profile_id: String(args.p_profile_id) };
    return { data: null, error: null };
  };
});

describe("계정 발급 뒤 안내 발송", () => {
  test("새 계정이면 감사 로그 뒤에 선생님 번호로 계정 안내를 보낸다", async () => {
    const result = await registerTeacherWithAccount(ctx(), input());

    expect(mocks.sendAndLog).toHaveBeenCalledTimes(1);
    const args = mocks.sendAndLog.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      templateKey: "teacherAccount",
      phone: "01012345678",
      profileId: "auth-user-1",
      dedupeKey: "teacherIssue:teacher-1:2026-11-26T01:00:00Z",
      variables: {
        이름: "김선생",
        계정종류: "선생님",
        소속: "위닝고등학교",
        아이디: "ABCD2345XY7Z9K",
        임시비밀번호: result.issued?.tempPassword,
      },
    });
    const events = kit.state.events;
    expect(events.indexOf("insert:admin_access_logs")).toBeGreaterThan(-1);
    expect(events.indexOf("send:teacherAccount")).toBeGreaterThan(
      events.indexOf("insert:admin_access_logs"),
    );
    expect(result.send).toEqual({ status: "sent", logId: 7 });
  });

  test("학교 관리자는 계정종류가 학교 관리자다", async () => {
    teacher = { ...teacher, role: "school_admin" };
    await registerTeacherWithAccount(ctx(), input("school_admin"));

    expect(mocks.sendAndLog.mock.calls[0]?.[0].variables.계정종류).toBe(
      "학교 관리자",
    );
  });

  test("이미 계정이 있으면 보내지 않고 send 는 null 이다", async () => {
    teacher = { ...teacher, profile_id: "auth-user-1" };
    const result = await registerTeacherWithAccount(ctx(), input());

    expect(mocks.sendAndLog).not.toHaveBeenCalled();
    expect(result.send).toBeNull();
  });

  test("발송이 실패하거나 던져도 발급은 성공으로 끝나고 결과에 실패가 실린다", async () => {
    mocks.sendAndLog.mockResolvedValueOnce({ status: "failed", reason: "x" });
    const failed = await registerTeacherWithAccount(ctx(), input());
    expect(failed.issued).not.toBeNull();
    expect(failed.send?.status).toBe("failed");

    teacher = { ...TEACHER };
    mocks.sendAndLog.mockRejectedValueOnce(new Error("boom"));
    const thrown = await registerTeacherWithAccount(ctx(), input());
    expect(thrown.issued).not.toBeNull();
    expect(thrown.send?.status).toBe("failed");
  });

  test("번호가 없어 건너뛰면 skipped 로 돌려준다", async () => {
    mocks.sendAndLog.mockResolvedValueOnce({
      status: "skipped",
      reason: "no_phone",
    });
    const result = await registerTeacherWithAccount(ctx(), input());
    expect(result.send).toEqual({ status: "skipped", reason: "no_phone" });
  });

  test("등록 응답에는 발급한 경우에만 sendStatus 가 실린다", async () => {
    const issued = await registerTeacherWithAccount(ctx(), input());
    expect(registerResponseBody(issued)).toMatchObject({ sendStatus: "sent" });

    teacher = { ...teacher, profile_id: "auth-user-1" };
    const existing = await registerTeacherWithAccount(ctx(), input());
    expect(registerResponseBody(existing)).not.toHaveProperty("sendStatus");
  });

  test("기존 교사에게 발급해도 안내를 보내고 결과에 싣는다", async () => {
    const result = await issueAccountForExistingTeacher(ctx(), "teacher-1");

    expect(result.status).toBe("issued");
    expect(mocks.sendAndLog).toHaveBeenCalledTimes(1);
    if (result.status === "issued") expect(result.send.status).toBe("sent");
  });
});

describe("임시 비밀번호 재발급 뒤 안내 발송", () => {
  beforeEach(() => {
    teacher = { ...teacher, profile_id: "profile-t1" };
    kit.state.rows.alimtalk_send_logs = () => [{ status: "failed" }];
  });

  test("Auth 비밀번호를 바꾼 뒤 새 임시 비밀번호로 보낸다", async () => {
    const result = await reissueTeacherAccount(ctx(), "teacher-1");

    expect(result.status).toBe("reissued");
    if (result.status !== "reissued") return;
    const args = mocks.sendAndLog.mock.calls[0]?.[0];
    expect(args.variables.임시비밀번호).toBe(result.tempPassword);
    expect(args.dedupeKey).toBe("teacherIssue:teacher-1:2026-11-26T01:00:00Z");
    const events = kit.state.events;
    expect(events.indexOf("send:teacherAccount")).toBeGreaterThan(
      events.lastIndexOf("auth:updateUserById"),
    );
    expect(result.send.status).toBe("sent");
  });

  test("발송을 연결했으므로 기본값은 마지막 발송이 실패일 때만 재발급한다", async () => {
    kit.state.rows.alimtalk_send_logs = () => [{ status: "sent" }];
    expect((await reissueTeacherAccount(ctx(), "teacher-1")).status).toBe(
      "send_not_failed",
    );
  });
});
