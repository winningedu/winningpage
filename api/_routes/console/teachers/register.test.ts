// POST /api/console/teachers/register 계약 검증(W14b). 가짜 service_role 클라이언트는 consoleTestKit.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import handler from "./register.js";

type Captured = { status: number; body: unknown };

async function post(body: unknown): Promise<Captured> {
  const captured: Captured = { status: 0, body: undefined };
  const res = {
    setHeader: () => {},
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body,
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const VALID = {
  name: "김교사",
  phone: "010-1234-5678",
  classes: [{ grade: "고1", name: "3반" }],
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rpc.fn_teacher_register = () => ({
    data: [{ teacher_id: "teacher-1", verdict: "created" }],
    error: null,
  });
  kit.state.rows.teachers = (filters) =>
    filters.id === "teacher-1"
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

describe("POST /api/console/teachers/register mixed-grade class", () => {
  const MIXED = {
    name: "김교사",
    phone: "010-1234-5678",
    classes: [{ grade: null, name: "A" }],
  };

  test("an academy tenant registers a teacher into a mixed-grade class with a null grade", async () => {
    kit.state.rows.tenants = () => ({ org_type: "사기업" });
    let args: Record<string, unknown> = {};
    kit.state.rpc.fn_teacher_register = (a) => {
      args = a;
      return {
        data: [{ teacher_id: "teacher-1", verdict: "created" }],
        error: null,
      };
    };

    const r = await post(MIXED);

    expect(r.status).toBe(200);
    expect(args.p_classes).toEqual([{ grade: null, name: "A" }]);
  });

  test("a school tenant cannot have a mixed-grade class: 400 and nothing is written", async () => {
    kit.state.rows.tenants = () => ({ org_type: "학교" });
    const rpc = vi.fn(() => ({ data: [], error: null }));
    kit.state.rpc.fn_teacher_register = rpc;

    const r = await post(MIXED);

    expect(r.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
  });

  test.each([
    [
      "WC105",
      "MIXED_CLASS_NAME_TAKEN",
      "같은 이름의 학년 반이 이미 있습니다. 반 이름을 바꿔 주세요.",
    ],
    [
      "40P01",
      "TRY_AGAIN",
      "다른 작업과 겹쳤습니다. 잠시 뒤 다시 시도해 주세요.",
    ],
    [
      "55P03",
      "TRY_AGAIN",
      "다른 작업이 끝나길 기다리다 멈췄습니다. 잠시 뒤 다시 시도해 주세요.",
    ],
  ])(
    "the DB error %s is a 409 %s with a message, not a 500",
    async (dbCode, code, message) => {
      kit.state.rows.tenants = () => ({ org_type: "사기업" });
      kit.state.rpc.fn_teacher_register = () => ({
        data: null,
        error: { code: dbCode },
      });

      const r = await post(MIXED);

      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: { code, message } });
    },
  );

  test("a graded class never reads the tenant", async () => {
    kit.state.rows.tenants = () => {
      throw new Error("tenant must not be read");
    };

    expect((await post(VALID)).status).toBe(200);
  });
});

describe("POST /api/console/teachers/register", () => {
  test("신규 교사는 등록하고 합성 이메일 계정을 만들어 임시 비밀번호를 한 번 돌려준다", async () => {
    const r = await post(VALID);

    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      teacherId: "teacher-1",
      loginId: "ABCD2345XY7Z9K",
      verdict: "created",
    });
    expect(body.tempPassword).toHaveLength(10);
    expect(kit.state.auth.createUser).toHaveBeenCalledWith({
      email: "abcd2345xy7z9k@teacher.schoolmentor.kr",
      password: body.tempPassword,
      email_confirm: true,
    });
  });

  test("임시 비밀번호는 DB 인자, 감사 로그, 콘솔 로그에 평문으로 남지 않고 attach 에는 해시만 간다", async () => {
    const logs = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
    ];
    let attachArgs: Record<string, unknown> = {};
    kit.state.rpc.fn_teacher_attach_account = (args) => {
      attachArgs = args;
      return { data: null, error: null };
    };

    const r = await post(VALID);

    const password = (r.body as { tempPassword: string }).tempPassword;
    expect(JSON.stringify(attachArgs)).not.toContain(password);
    expect(attachArgs.p_temp_hash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(kit.state.inserts)).not.toContain(password);
    for (const spy of logs) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(password);
    }
  });

  test("DB 등록, Auth 사용자, attach, 감사 로그 순서로 처리하고 account_issue 를 남긴다", async () => {
    await post(VALID);

    expect(
      kit.state.events.filter((e) => e !== "rpc:fn_console_actor"),
    ).toEqual([
      "rpc:fn_teacher_register",
      "rpc:fn_teacher_issue_claim",
      "auth:createUser",
      "rpc:fn_teacher_attach_account",
      "insert:admin_access_logs",
    ]);
    expect(kit.state.inserts[0]?.row).toMatchObject({
      tenant_id: "tenant-1",
      actor_kind: "school_admin",
      action: "account_issue",
      resource_key: "console.teachers",
      target_id: "teacher-1",
      meta: {
        verdict: "created",
        loginId: "ABCD2345XY7Z9K",
        sendDedupeKey: "teacherIssue:teacher-1:2026-11-05T05:00:00Z",
      },
    });
  });

  test("계정이 이미 있는 같은 사람은 학급만 더하고 새 계정이나 임시 비밀번호를 만들지 않는다", async () => {
    kit.state.rpc.fn_teacher_register = () => ({
      data: [{ teacher_id: "teacher-1", verdict: "classes_added" }],
      error: null,
    });
    kit.state.rows.teachers = () => ({
      login_id: "ABCD2345XY7Z9K",
      profile_id: "existing-profile",
    });

    const r = await post(VALID);

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      teacherId: "teacher-1",
      loginId: "ABCD2345XY7Z9K",
      verdict: "classes_added",
    });
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
    expect(kit.state.inserts[0]?.row).toMatchObject({ action: "update" });
  });

  test("다른 요청이 이미 발급을 맡았으면(claim busy) Auth 와 비밀번호를 건드리지 않고 임시 비밀번호 없이 응답한다", async () => {
    kit.state.rpc.fn_teacher_issue_claim = () => ({
      data: "busy",
      error: null,
    });

    const r = await post(VALID);

    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("tempPassword");
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
    expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
    expect(kit.state.events).not.toContain("rpc:fn_teacher_attach_account");
    expect(kit.state.inserts[0]?.row).toMatchObject({ action: "update" });
  });

  test("전화번호가 다른 이름의 교사에게 쓰이면 409 PHONE_IN_USE 이고 계정을 만들지 않는다", async () => {
    kit.state.rpc.fn_teacher_register = () => ({
      data: null,
      error: { code: "WC075" },
    });

    const r = await post(VALID);

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "PHONE_IN_USE" } });
    expect(kit.state.auth.createUser).not.toHaveBeenCalled();
  });

  test("PHONE_IN_USE 응답에는 그 번호를 쓰는 기존 교사의 로그인 아이디를 싣는다(같은 기관만)", async () => {
    kit.state.rpc.fn_teacher_register = () => ({
      data: null,
      error: { code: "WC075" },
    });
    const queried: Record<string, unknown>[] = [];
    kit.state.rows.teachers = (filters) => {
      queried.push({ ...filters });
      return [
        { login_id: "SM26HB83K7MPQ2", deleted_at: "2026-10-01T00:00:00Z" },
        { login_id: "SM26HB83K7MPQ3", deleted_at: null },
      ];
    };

    const r = await post(VALID);

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      error: { code: "PHONE_IN_USE" },
      existingLoginId: "SM26HB83K7MPQ3",
    });
    expect(queried.at(-1)).toMatchObject({
      tenant_id: "tenant-1",
      phone: "01012345678",
    });
  });

  test("다른 교사가 이미 담임인 학급이면 409 CLASS_TAKEN", async () => {
    kit.state.rpc.fn_teacher_register = () => ({
      data: null,
      error: { code: "23505" },
    });

    const r = await post(VALID);

    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "CLASS_TAKEN" } });
  });

  test.each(["22023", "23514"])(
    "학급 이름이나 학년이 올바르지 않아 DB 가 %s 로 막으면 400 INVALID_CLASS",
    async (dbCode) => {
      kit.state.rpc.fn_teacher_register = () => ({
        data: null,
        error: { code: dbCode },
      });

      const r = await post(VALID);

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: { code: "INVALID_CLASS" } });
    },
  );

  test.each([
    ["이름 누락", { ...VALID, name: " " }],
    ["전화번호 형식 오류", { ...VALID, phone: "02-123-4567" }],
    ["학급 배열이 아님", { ...VALID, classes: "3반" }],
    ["학급에 학년 누락", { ...VALID, classes: [{ name: "3반" }] }],
  ])("%s 이면 400 이고 아무것도 만들지 않는다", async (_label, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(kit.state.events).not.toContain("rpc:fn_teacher_register");
  });

  test("담임은 403 NOT_SCHOOL_ADMIN 이다", async () => {
    kit.state.actor = { ...kit.state.actor, kind: "homeroom" };

    const r = await post(VALID);

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: { code: "NOT_SCHOOL_ADMIN" } });
  });

  test("감사 로그를 남기지 못하면 성공으로 끝나지 않고 500 이다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.insertError = { code: "XX000" };

    const r = await post(VALID);

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("tempPassword");
  });
});
