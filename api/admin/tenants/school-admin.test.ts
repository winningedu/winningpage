// POST /api/admin/tenants/school-admin 계약 검증. 본사 권한 tenants edit 만 요구하고 대행 세션은 필요 없다.

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

import handler from "./school-admin.js";

const post = (body: unknown) => callHandler(handler, body);

const VALID = { tenantId: "tenant-7", name: "박관리", phone: "010-9999-8888" };

beforeEach(() => {
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@example.com" };
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: "tenants", level: "edit" }],
    error: null,
  });
  kit.state.rpc.fn_teacher_register = () => ({
    data: [{ teacher_id: "teacher-9", verdict: "created" }],
    error: null,
  });
  kit.state.rows.teachers = (filters) =>
    filters.id === "teacher-9"
      ? {
          login_id: "ABCD2345XY7Z9K",
          profile_id: null,
          temp_password_issued_at: "2026-11-05T05:00:00Z",
        }
      : null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/tenants/school-admin", () => {
  test.each([
    ["권한 없음", []],
    ["tenants view 만", [{ resource_key: "tenants", level: "view" }]],
    ["다른 리소스 edit", [{ resource_key: "members", level: "edit" }]],
  ])("%s 이면 403 이고 아무것도 만들지 않는다", async (_label, perms) => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: perms,
      error: null,
    });

    const r = await post(VALID);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(kit.state.events).not.toContain("rpc:fn_teacher_register");
  });

  test("tenants edit 권한이면 대행 세션 없이 학교 관리자를 발급하고 임시 비밀번호를 한 번 돌려준다", async () => {
    let registerArgs: Record<string, unknown> = {};
    kit.state.rpc.fn_teacher_register = (args) => {
      registerArgs = args;
      return {
        data: [{ teacher_id: "teacher-9", verdict: "created" }],
        error: null,
      };
    };

    const r = await post(VALID);

    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      teacherId: "teacher-9",
      loginId: "ABCD2345XY7Z9K",
      verdict: "created",
    });
    expect(body.tempPassword).toHaveLength(10);
    expect(registerArgs).toMatchObject({
      p_tenant_id: "tenant-7",
      p_name: "박관리",
      p_phone: "01099998888",
      p_role: "school_admin",
      p_classes: [],
      p_actor: "hq-1",
    });
    expect(kit.state.events).not.toContain("rpc:fn_console_actor");
    expect(kit.state.inserts[0]?.row).toMatchObject({
      profile_id: "hq-1",
      actor_email: "hq@example.com",
      tenant_id: "tenant-7",
      actor_kind: "hq",
      proxy_session_id: null,
      action: "account_issue",
      target_id: "teacher-9",
    });
    expect(JSON.stringify(kit.state.inserts)).not.toContain(
      body.tempPassword as string,
    );
  });

  test("직책, 담당 이메일, 일반전화를 등록 함수에 넘긴다(숫자만으로 정규화)", async () => {
    let registerArgs: Record<string, unknown> = {};
    kit.state.rpc.fn_teacher_register = (args) => {
      registerArgs = args;
      return {
        data: [{ teacher_id: "teacher-9", verdict: "created" }],
        error: null,
      };
    };

    const r = await post({
      ...VALID,
      position: " 교감 ",
      email: "Admin@School.kr",
      landline: "02-123-4567",
    });

    expect(r.status).toBe(200);
    expect(registerArgs).toMatchObject({
      p_position: "교감",
      p_email: "admin@school.kr",
      p_landline: "021234567",
    });
  });

  test("직책, 이메일, 일반전화를 생략하면 등록 함수 인자에 넣지 않는다", async () => {
    let registerArgs: Record<string, unknown> = {};
    kit.state.rpc.fn_teacher_register = (args) => {
      registerArgs = args;
      return {
        data: [{ teacher_id: "teacher-9", verdict: "created" }],
        error: null,
      };
    };

    await post(VALID);

    expect(registerArgs).not.toHaveProperty("p_position");
    expect(registerArgs).not.toHaveProperty("p_email");
    expect(registerArgs).not.toHaveProperty("p_landline");
  });

  test.each([
    ["이메일 형식 오류", { email: "not-an-email" }],
    ["일반전화 형식 오류", { landline: "123" }],
    ["직책이 문자열이 아님", { position: 3 }],
    ["직책이 너무 김", { position: "가".repeat(51) }],
  ])("%s 는 400 이고 아무것도 만들지 않는다", async (_label, extra) => {
    const r = await post({ ...VALID, ...extra });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(kit.state.events).not.toContain("rpc:fn_teacher_register");
  });

  test("같은 사람이 이미 담임이면 승격하고 감사 로그에 promoted 가 남는다", async () => {
    kit.state.rpc.fn_teacher_register = () => ({
      data: [{ teacher_id: "teacher-9", verdict: "promoted" }],
      error: null,
    });
    kit.state.rows.teachers = () => ({
      login_id: "ABCD2345XY7Z9K",
      profile_id: "profile-9",
    });

    const r = await post(VALID);

    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("tempPassword");
    expect(kit.state.inserts[0]?.row).toMatchObject({
      action: "update",
      meta: { verdict: "promoted", role: "school_admin" },
    });
  });

  test("없는 기관은 404 TENANT_NOT_FOUND", async () => {
    kit.state.rpc.fn_teacher_register = () => ({
      data: null,
      error: { code: "P0002" },
    });

    const r = await post(VALID);

    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ error: { code: "TENANT_NOT_FOUND" } });
  });

  test("전화번호가 다른 이름이면 409 PHONE_IN_USE", async () => {
    kit.state.rpc.fn_teacher_register = () => ({
      data: null,
      error: { code: "WC075" },
    });

    const r = await post(VALID);

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "PHONE_IN_USE" } });
  });

  test.each([
    ["기관 누락", { ...VALID, tenantId: undefined }],
    ["이름 누락", { ...VALID, name: "" }],
    ["전화번호 오류", { ...VALID, phone: "12" }],
  ])("%s 이면 400", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(kit.state.events).not.toContain("rpc:fn_teacher_register");
  });
});
