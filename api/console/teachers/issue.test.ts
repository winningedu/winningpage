// POST /api/console/teachers/issue 계약 검증(W16b). 가짜 service_role 클라이언트는 consoleTestKit.

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

import handler from "./issue.js";

const post = (body: unknown) => callHandler(handler, body);

const ISSUED_AT = "2026-11-05T05:00:00Z";

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.teachers = (filters) =>
    filters.id === "teacher-1"
      ? {
          tenant_id: "tenant-1",
          login_id: "ABCD2345XY7Z9K",
          profile_id: null,
          deleted_at: null,
          temp_password_issued_at: ISSUED_AT,
        }
      : null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/console/teachers/issue", () => {
  test("계정이 없는 담임에게 계정을 발급하고 임시 비밀번호를 한 번 돌려준다", async () => {
    const r = await post({ teacherId: "teacher-1" });

    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      teacherId: "teacher-1",
      loginId: "ABCD2345XY7Z9K",
    });
    expect(body.tempPassword).toHaveLength(10);
    expect(kit.state.auth.createUser).toHaveBeenCalledWith({
      email: "abcd2345xy7z9k@teacher.schoolmentor.kr",
      password: body.tempPassword,
      email_confirm: true,
    });
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "account_issue",
      target_id: "teacher-1",
      tenant_id: "tenant-1",
    });
    expect(JSON.stringify(kit.state.inserts)).not.toContain(
      body.tempPassword as string,
    );
  });

  test("다른 요청이 이미 발급을 맡았으면 409 ACCOUNT_EXISTS 이고 Auth 를 건드리지 않는다", async () => {
    kit.state.rpc.fn_teacher_issue_claim = () => ({
      data: "busy",
      error: null,
    });

    const r = await post({ teacherId: "teacher-1" });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "ACCOUNT_EXISTS" } });
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
  });

  test("이미 계정이 있으면 409 ACCOUNT_EXISTS 이고 Auth 를 건드리지 않는다", async () => {
    kit.state.rows.teachers = () => ({
      tenant_id: "tenant-1",
      login_id: "ABCD2345XY7Z9K",
      profile_id: "profile-9",
      deleted_at: null,
    });

    const r = await post({ teacherId: "teacher-1" });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "ACCOUNT_EXISTS" } });
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
  });

  test.each([
    ["다른 기관 교사", { tenant_id: "tenant-2", deleted_at: null }],
    ["삭제된 교사", { tenant_id: "tenant-1", deleted_at: "2026-11-01" }],
  ])("%s 는 404 로 존재를 숨긴다", async (_label, over) => {
    kit.state.rows.teachers = () => ({
      login_id: "ABCD2345XY7Z9K",
      profile_id: null,
      ...over,
    });

    const r = await post({ teacherId: "teacher-1" });

    expect(r.status).toBe(404);
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
  });

  test("학교 관리자 발급은 role school_admin 으로 등록하고 계정과 임시 비밀번호를 만든다", async () => {
    let registerArgs: Record<string, unknown> = {};
    kit.state.rpc.fn_teacher_register = (args) => {
      registerArgs = args;
      return {
        data: [{ teacher_id: "teacher-2", verdict: "created" }],
        error: null,
      };
    };
    kit.state.rows.teachers = (filters) =>
      filters.id === "teacher-2"
        ? {
            login_id: "ABCD2345XY7Z9K",
            profile_id: null,
            temp_password_issued_at: ISSUED_AT,
          }
        : null;

    const r = await post({
      role: "school_admin",
      name: "박관리",
      phone: "01099998888",
    });

    expect(r.status).toBe(200);
    expect(registerArgs).toMatchObject({
      p_tenant_id: "tenant-1",
      p_name: "박관리",
      p_phone: "01099998888",
      p_role: "school_admin",
      p_classes: [],
    });
    expect(r.body).toMatchObject({
      verdict: "created",
      teacherId: "teacher-2",
    });
    expect((r.body as { tempPassword: string }).tempPassword).toHaveLength(10);
  });

  test("같은 사람이 이미 담임이면 승격하고 계정은 그대로이며 감사 로그에 promoted 가 남는다", async () => {
    kit.state.rpc.fn_teacher_register = () => ({
      data: [{ teacher_id: "teacher-3", verdict: "promoted" }],
      error: null,
    });
    kit.state.rows.teachers = () => ({
      login_id: "ABCD2345XY7Z9K",
      profile_id: "profile-3",
    });

    const r = await post({
      role: "school_admin",
      name: "박관리",
      phone: "01099998888",
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      teacherId: "teacher-3",
      loginId: "ABCD2345XY7Z9K",
      verdict: "promoted",
    });
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "update",
      target_id: "teacher-3",
      meta: { verdict: "promoted", role: "school_admin" },
    });
  });

  test("학교 관리자 발급에서 전화번호가 다른 이름이면 409 PHONE_IN_USE", async () => {
    kit.state.rpc.fn_teacher_register = () => ({
      data: null,
      error: { code: "WC075" },
    });

    const r = await post({
      role: "school_admin",
      name: "박관리",
      phone: "01099998888",
    });

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "PHONE_IN_USE" } });
  });

  test.each([
    ["본문 없음", undefined],
    ["teacherId 가 문자열이 아님", { teacherId: 5 }],
    [
      "관리자 발급에 전화번호 오류",
      { role: "school_admin", name: "박", phone: "123" },
    ],
    ["허용 밖 role", { role: "homeroom", name: "박", phone: "01099998888" }],
  ])("%s 이면 400", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
  });

  test("담임은 403 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    expect((await post({ teacherId: "teacher-1" })).status).toBe(403);
  });
});
