// POST /api/auth/teacher-reset-password 계약 검증(결정 103). 휴대폰 인증으로 선생님 비밀번호를 다시 정한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
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

beforeEach(() => {
  kit.state = createKitState();
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

  test("아이디는 앞뒤 공백과 소문자를 허용한다", async () => {
    const r = await post({
      loginId: ` ${LOGIN_ID.toLowerCase()} `,
      phone: "010-1234-5678",
      password: PW,
    });

    // 형식 검사를 통과해 인증 조회까지 간다(인증이 없으므로 VERIFICATION_EXPIRED).
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "VERIFICATION_EXPIRED" } });
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
});
