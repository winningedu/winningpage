// POST /api/auth/teacher-reset-password 계약 검증(결정 103). 휴대폰 인증으로 선생님 비밀번호를 다시 정한다.

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
  matchRows,
} from "../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getEnv: (...names: string[]) =>
    process.env[names[0] as string] ?? "env-value",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: kit.signIn } }),
}));

import handler from "./teacher-reset-password.js";

const LOGIN_ID = "ABCD2345XY7Z9K";
const PHONE = "01012345678";
const PW = "NewPass123";

const post = (body: unknown) => callHandler(handler, body);

const TEACHER = {
  id: "teacher-1",
  tenant_id: "tenant-1",
  profile_id: "profile-1",
  login_id: LOGIN_ID,
  phone: PHONE,
  status: "active",
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.phone_verifications = (f) =>
    f.id ? [{ id: "v1" }] : { id: "v1", verified_at: new Date().toISOString() };
  kit.state.rows.teachers = (f) => matchRows([TEACHER], f)[0] ?? null;
  kit.signIn.mockReset();
  kit.signIn.mockResolvedValue({
    data: { session: { access_token: "new-access" } },
    error: null,
  });
  kit.signOut = vi.fn(async () => {
    kit.state.events.push("auth:signOut");
    return { error: null };
  });
  (kit.state.auth as Record<string, unknown>).signOut = kit.signOut;
  process.env.SITE = "schoolmentor";
});

afterEach(() => {
  delete process.env.SITE;
  vi.restoreAllMocks();
});

describe("POST /api/auth/teacher-reset-password", () => {
  test("위닝 사이트에서는 404 이고 아무것도 읽지 않는다", async () => {
    process.env.SITE = "winning";

    const r = await post({});

    expect(r.status).toBe(404);
    expect(r.body).toEqual({ code: "NOT_FOUND" });
    expect(kit.state.reads).toEqual([]);
  });

  test.each([
    ["아이디 형식이 틀리면", { loginId: "abc", phone: PHONE, password: PW }],
    [
      "휴대폰 번호 형식이 틀리면",
      { loginId: LOGIN_ID, phone: "123", password: PW },
    ],
    [
      "비밀번호에 숫자가 없으면",
      { loginId: LOGIN_ID, phone: PHONE, password: "OnlyLetters" },
    ],
    ["본문이 비어 있으면", {}],
  ])("%s 400 이고 아무것도 읽지 않는다", async (_name, body) => {
    const r = await post(body);

    expect(r.status).toBe(400);
    expect(kit.state.reads).toEqual([]);
  });

  test("비밀번호 규칙 위반은 서버 규칙 코드와 문구를 돌려준다", async () => {
    const r = await post({
      loginId: LOGIN_ID,
      phone: PHONE,
      password: "OnlyLetters",
    });

    expect(r.body).toEqual({
      error: {
        code: "PASSWORD_NO_DIGIT",
        message: "비밀번호에 숫자를 포함해 주세요.",
      },
    });
  });

  test("아이디는 앞뒤 공백과 소문자를 허용하고 번호는 숫자만 남겨 교사를 조회한다", async () => {
    const seen: Record<string, unknown>[] = [];
    kit.state.rows.teachers = (f) => {
      seen.push(f);
      return null;
    };

    await post({
      loginId: ` ${LOGIN_ID.toLowerCase()} `,
      phone: "010-1234-5678",
      password: PW,
    });

    expect(seen[0]).toMatchObject({
      login_id: LOGIN_ID,
      phone: PHONE,
      status: "active",
    });
  });

  test("인증 행이 없으면(없음, 이미 소비됨) VERIFICATION_EXPIRED 와 안내 문구를 돌려준다", async () => {
    kit.state.rows.phone_verifications = () => null;

    const r = await post({ loginId: LOGIN_ID, phone: PHONE, password: PW });

    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      error: {
        code: "VERIFICATION_EXPIRED",
        message: "인증 시간이 지났어요. 인증번호를 다시 받아 주세요.",
      },
    });
  });

  test("인증한 지 10분이 지났으면 VERIFICATION_EXPIRED 이고 교사를 조회하지 않는다", async () => {
    kit.state.rows.phone_verifications = () => ({
      id: "v1",
      verified_at: new Date(Date.now() - 10 * 60 * 1000 - 1000).toISOString(),
    });

    const r = await post({ loginId: LOGIN_ID, phone: PHONE, password: PW });

    expect(r.body).toMatchObject({ error: { code: "VERIFICATION_EXPIRED" } });
    expect(kit.state.reads.map((x) => x.table)).toEqual([
      "phone_verifications",
    ]);
  });

  test.each([
    ["번호가 다르면", { phone: "01099998888" }, TEACHER],
    ["아이디가 다르면", { loginId: "ZZZZ2345XY7Z9K" }, TEACHER],
    ["비활성 교사면", {}, { ...TEACHER, status: "inactive" }],
  ])(
    "%s TEACHER_NOT_MATCHED 이고 인증을 소비하지 않는다",
    async (_name, over, teacher) => {
      kit.state.rows.teachers = (f) => matchRows([teacher], f)[0] ?? null;

      const r = await post({
        loginId: LOGIN_ID,
        phone: PHONE,
        password: PW,
        ...over,
      });

      expect(r.status).toBe(400);
      expect(r.body).toEqual({
        error: {
          code: "TEACHER_NOT_MATCHED",
          message: "아이디와 휴대폰 번호를 다시 확인해 주세요.",
        },
      });
      expect(kit.state.updates).toEqual([]);
      expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
    },
  );

  test("성공하면 Auth 비밀번호를 바꾸고 임시 상태를 지우고 잠금을 풀고 모든 세션을 끝내고 감사 로그를 남긴다", async () => {
    const rpcArgs: Record<string, unknown>[] = [];
    kit.state.rpc.fn_teacher_password_set = (args) => {
      rpcArgs.push(args);
      return { data: null, error: null };
    };

    const r = await post({ loginId: LOGIN_ID, phone: PHONE, password: PW });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(kit.state.auth.updateUserById).toHaveBeenCalledWith("profile-1", {
      password: PW,
    });
    expect(rpcArgs).toEqual([
      { p_teacher_id: "teacher-1", p_tenant: "tenant-1" },
    ]);
    const lockHash = `\\x${createHash("sha256")
      .update(`${LOGIN_ID.toLowerCase()}@teacher.schoolmentor.kr`)
      .digest("hex")}`;
    expect(kit.state.deletes).toEqual([
      { table: "login_attempts", filters: { identifier_hash: lockHash } },
    ]);
    expect(kit.signIn).toHaveBeenCalledWith({
      email: `${LOGIN_ID.toLowerCase()}@teacher.schoolmentor.kr`,
      password: PW,
    });
    expect(kit.signOut).toHaveBeenCalledWith("new-access", "global");
    expect(kit.state.inserts).toHaveLength(1);
    expect(kit.state.inserts[0]).toMatchObject({
      table: "admin_access_logs",
      row: {
        action: "password_set",
        actor_kind: "teacher",
        actor_login_id: LOGIN_ID,
        teacher_id: "teacher-1",
        tenant_id: "tenant-1",
        target_id: "teacher-1",
        meta: { kind: "reset" },
      },
    });
    expect(
      kit.state.events.filter((e) => e !== "rpc:fn_console_actor"),
    ).toEqual([
      "update:phone_verifications",
      "auth:updateUserById",
      "rpc:fn_teacher_password_set",
      "delete:login_attempts",
      "auth:signOut",
      "insert:admin_access_logs",
    ]);
    expect(kit.state.updates).toEqual([
      {
        table: "phone_verifications",
        values: { consumed_at: expect.any(String) },
        filters: { id: "v1" },
      },
    ]);
  });

  test("Auth 비밀번호 교체가 실패하면 선점한 인증을 되돌리고 500 SAVE_FAILED 를 돌려준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    kit.state.auth.updateUserById.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });

    const r = await post({ loginId: LOGIN_ID, phone: PHONE, password: PW });

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ error: { code: "SAVE_FAILED" } });
    expect(kit.state.updates.map((u) => u.values)).toEqual([
      { consumed_at: expect.any(String) },
      { consumed_at: null },
    ]);
    expect(kit.state.deletes).toEqual([]);
    expect(kit.state.inserts).toEqual([]);
  });

  test("선점 UPDATE 가 0행이면(동시에 다른 요청이 사용) VERIFICATION_EXPIRED 이고 비밀번호를 바꾸지 않는다", async () => {
    kit.state.rows.phone_verifications = (f) =>
      f.id ? [] : { id: "v1", verified_at: new Date().toISOString() };

    const r = await post({ loginId: LOGIN_ID, phone: PHONE, password: PW });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "VERIFICATION_EXPIRED" } });
    expect(kit.state.auth.updateUserById).not.toHaveBeenCalled();
  });
});
