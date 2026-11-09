// POST /api/reset-password-by-phone 의 계정 고르기(chooseAccount, 스쿨멘토).
// 위닝은 새 필드를 보내지 않으므로 가장 먼저 가입한 계정 하나를 재설정하는
// 기존 동작이 그대로여야 한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeDb,
  createFakeSupabase,
  type FakeDb,
} from "./_lib/fakeSupabase.testkit.js";

const state = vi.hoisted(() => ({
  db: null as unknown,
  signIn: vi.fn(),
}));

vi.mock("./_lib/supabaseAdmin.js", () => ({
  getEnv: (...names: string[]) =>
    process.env[names[0] as string] ?? "env-value",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: state.signIn } }),
}));

import { hashParam } from "./_lib/auth/login.js";
import handler from "./reset-password-by-phone.js";

let db: FakeDb;

const reset = (extra: Record<string, unknown> = {}) =>
  callHandler(handler as never, { phone: "010-1234-5678", ...extra });

const NEW_PASSWORD = "NewPass123!";

const verification = () => db.tables.phone_verifications?.[0];

beforeEach(() => {
  db = createFakeDb({
    tables: {
      tenants: [
        { id: "t-school", name: "한빛중학교" },
        { id: "t-academy", name: "새봄학원" },
      ],
      phone_verifications: [
        {
          id: "v1",
          phone: "01012345678",
          purpose: "reset_password",
          consumed_at: null,
          verified_at: new Date().toISOString(),
          created_at: "2026-11-06T00:00:00Z",
        },
      ],
      profiles: [
        {
          id: "p1",
          email: "first@example.com",
          username: "kimminsu",
          phone: "01012345678",
          member_type: "student",
          tenant_id: "t-school",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "p2",
          email: "second@example.com",
          username: "kimmin2",
          phone: "010-1234-5678",
          member_type: "student",
          tenant_id: "t-academy",
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
    },
  });
  state.db = createFakeSupabase(db);
});

describe("reset-password-by-phone chooseAccount", () => {
  test("새 필드가 없으면 가장 먼저 가입한 계정을 재설정한다(위닝)", async () => {
    const res = await reset();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ found: true, via: "phone" });
    expect(db.passwordUpdates.map((u) => u.id)).toEqual(["p1"]);
  });

  test("계정이 2개 이상이고 accountId 가 없으면 409 로 고르게 하고 인증을 소비하지 않는다", async () => {
    const res = await reset({ chooseAccount: true });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "choose_account",
      accounts: [
        { accountId: "p1", maskedId: "kim*****", tenantName: "한빛중학교" },
        { accountId: "p2", maskedId: "kim****", tenantName: "새봄학원" },
      ],
    });
    expect(db.passwordUpdates).toEqual([]);
    expect(verification()?.consumed_at).toBeNull();
  });

  test("고른 accountId 의 계정만 재설정하고 인증을 소비한다", async () => {
    const res = await reset({ chooseAccount: true, accountId: "p2" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      found: true,
      temp_password: expect.any(String),
    });
    expect(db.passwordUpdates.map((u) => u.id)).toEqual(["p2"]);
    expect(verification()?.consumed_at).not.toBeNull();
  });

  test("매치 목록에 없는 accountId 는 400 이고 아무것도 바꾸지 않는다", async () => {
    const res = await reset({ chooseAccount: true, accountId: "stranger" });
    expect(res.status).toBe(400);
    expect(db.passwordUpdates).toEqual([]);
    expect(verification()?.consumed_at).toBeNull();
  });

  test("계정이 1개면 고르게 하지 않고 바로 재설정한다", async () => {
    db.tables.profiles?.pop();
    const res = await reset({ chooseAccount: true });
    expect(res.status).toBe(200);
    expect(db.passwordUpdates.map((u) => u.id)).toEqual(["p1"]);
  });

  test("chooseAccount 없이 보낸 accountId 는 무시한다", async () => {
    const res = await reset({ accountId: "p2" });
    expect(res.status).toBe(200);
    expect(db.passwordUpdates.map((u) => u.id)).toEqual(["p1"]);
  });

  test("조회 뒤 다른 요청이 인증을 먼저 소비했으면 401 이고 비밀번호를 바꾸지 않는다", async () => {
    // 인증 조회 이후 계정 조회 시점에 다른 요청이 같은 인증을 소비한 상황.
    const profiles = db.tables.profiles ?? [];
    Object.defineProperty(db.tables, "profiles", {
      get() {
        const v = verification();
        if (v) v.consumed_at = "2026-11-06T00:00:01Z";
        return profiles;
      },
    });
    const res = await reset();
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ reason: "phone_not_verified" });
    expect(db.passwordUpdates).toEqual([]);
  });

  test("비밀번호 갱신이 실패하면 선점한 인증을 되돌려 다시 시도할 수 있다", async () => {
    (
      state.db as {
        auth: { admin: { updateUserById: () => Promise<unknown> } };
      }
    ).auth.admin.updateUserById = async () => ({ error: new Error("boom") });
    const res = await reset();
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ reason: "update_failed" });
    expect(verification()?.consumed_at).toBeNull();
  });
});

// 스쿨멘토(SITE=schoolmentor)는 임시비밀번호 대신 학생이 새 비밀번호를 직접 정한다.
describe("reset-password-by-phone 새 비밀번호 직접 설정(스쿨멘토)", () => {
  beforeEach(() => {
    process.env.SITE = "schoolmentor";
    state.signIn.mockReset();
    state.signIn.mockResolvedValue({
      data: { session: { access_token: "new-access" } },
      error: null,
    });
  });

  afterEach(() => {
    delete process.env.SITE;
  });

  test.each([
    ["비밀번호가 없으면", {}],
    ["비밀번호가 문자열이 아니면", { password: 123456 }],
    ["비밀번호에 특수문자가 없으면", { password: "Abcdef12" }],
  ])("%s 400 invalid_password 이고 DB 를 읽지 않는다", async (_name, extra) => {
    const res = await reset(extra);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      ok: false,
      reason: "invalid_password",
      detail: "영문, 숫자, 특수문자를 모두 포함해 6자 이상 입력해 주세요.",
    });
    expect(verification()?.consumed_at).toBeNull();
    expect(db.passwordUpdates).toEqual([]);
  });

  test("고른 계정에 새 비밀번호를 정하고 전체 세션을 끊고 잠금 행을 지운다", async () => {
    db.tables.login_attempts = [
      { identifier_hash: hashParam("second@example.com") },
      { identifier_hash: hashParam("first@example.com") },
    ];
    const signOut = vi.fn(async () => ({ error: null }));
    (state.db as { auth: { admin: { signOut: unknown } } }).auth.admin.signOut =
      signOut;

    const res = await reset({
      chooseAccount: true,
      accountId: "p2",
      password: NEW_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      found: true,
      masked_email: "se****@ex***.com",
      via: "phone",
    });
    expect(db.passwordUpdates).toEqual([{ id: "p2", password: NEW_PASSWORD }]);
    expect(state.signIn).toHaveBeenCalledWith({
      email: "second@example.com",
      password: NEW_PASSWORD,
    });
    expect(signOut).toHaveBeenCalledWith("new-access", "global");
    expect(db.tables.login_attempts).toEqual([
      { identifier_hash: hashParam("first@example.com") },
    ]);
    expect(verification()?.consumed_at).not.toBeNull();
  });

  test("profiles.email 을 공백 제거와 소문자로 정규화해 세션 정리 로그인과 잠금 키에 쓴다", async () => {
    const profile = db.tables.profiles?.[0];
    if (profile) profile.email = " First@Example.COM ";
    db.tables.login_attempts = [
      { identifier_hash: hashParam("first@example.com") },
    ];

    const res = await reset({
      chooseAccount: true,
      accountId: "p1",
      password: NEW_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(state.signIn).toHaveBeenCalledWith({
      email: "first@example.com",
      password: NEW_PASSWORD,
    });
    expect(db.tables.login_attempts).toEqual([]);
  });

  test.each([
    ["성공하면", true, "ok"],
    ["세션 정리에 실패해도", false, "revoke_failed"],
  ])(
    "%s 계정 id 와 경로만 담은 로그 한 줄을 남긴다",
    async (_name, signInOk, outcome) => {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      if (!signInOk)
        state.signIn.mockResolvedValue({ data: {}, error: new Error("boom") });

      await reset({
        chooseAccount: true,
        accountId: "p2",
        password: NEW_PASSWORD,
      });

      expect(info).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith("[reset-password-by-phone] reset", {
        profileId: "p2",
        via: "phone",
        outcome,
      });
      vi.restoreAllMocks();
    },
  );

  test("계정이 여러 개면 409 로 고르게 하고 비밀번호를 바꾸지 않는다", async () => {
    const res = await reset({ chooseAccount: true, password: NEW_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "choose_account" });
    expect(db.passwordUpdates).toEqual([]);
    expect(state.signIn).not.toHaveBeenCalled();
    expect(verification()?.consumed_at).toBeNull();
  });

  test("세션 정리에 실패하면 500 revoke_failed 이고 비밀번호와 인증 선점은 그대로 둔다", async () => {
    db.tables.login_attempts = [
      { identifier_hash: hashParam("first@example.com") },
    ];
    state.signIn.mockResolvedValue({ data: {}, error: new Error("boom") });

    const res = await reset({
      chooseAccount: true,
      accountId: "p1",
      password: NEW_PASSWORD,
    });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, reason: "revoke_failed" });
    expect(db.passwordUpdates).toEqual([{ id: "p1", password: NEW_PASSWORD }]);
    expect(verification()?.consumed_at).not.toBeNull();
    expect(db.tables.login_attempts).toHaveLength(1);
  });

  test("비밀번호 갱신이 실패하면 선점한 인증을 되돌리고 세션 정리를 하지 않는다", async () => {
    (
      state.db as {
        auth: { admin: { updateUserById: () => Promise<unknown> } };
      }
    ).auth.admin.updateUserById = async () => ({ error: new Error("boom") });

    const res = await reset({ password: NEW_PASSWORD });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ reason: "update_failed" });
    expect(verification()?.consumed_at).toBeNull();
    expect(state.signIn).not.toHaveBeenCalled();
  });
});

describe("reset-password-by-phone 위닝은 password 를 무시한다", () => {
  test("password 를 보내도 임시비밀번호를 만들어 돌려주고 세션 정리는 하지 않는다", async () => {
    const res = await reset({ password: "NewPass123!" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      found: true,
      temp_password: expect.any(String),
    });
    expect(db.passwordUpdates).toHaveLength(1);
    expect(db.passwordUpdates[0]?.password).not.toBe("NewPass123!");
    expect(state.signIn).not.toHaveBeenCalled();
  });

  test("응답에 Cache-Control: no-store 를 싣는다", async () => {
    const res = await reset();

    expect(res.headers["Cache-Control"]).toBe("no-store");
  });
});
