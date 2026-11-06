// POST /api/auth/login 계약 검증(스쿨멘토 서버 로그인, 실패 잠금).
//
// defineHandler 가 만든 핸들러를 가짜 req/res 로 직접 호출한다. 관리자 클라이언트
// (begin/end rpc, profiles 조회)는 createSupabaseAdmin 모킹으로, GoTrue 비밀번호
// 로그인은 @supabase/supabase-js 의 createClient 모킹으로 바꿔 끼운다.

import { createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  beginResult: {
    data: [{ outcome: "proceed", attempt_no: 1, retry_after_s: 0 }],
    error: null,
  } as { data: unknown; error: unknown },
  resolvedEmail: null as string | null,
  teacher: null as Record<string, unknown> | null,
  resolveError: null as unknown,
  signIn: vi.fn(),
  rpc: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", () => {
  const table = (name: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "ilike", "is", "limit"]) {
      chain[method] = () => chain;
    }
    chain.maybeSingle = async () => ({
      data: name === "teachers" ? state.teacher : null,
      error: null,
    });
    return chain;
  };
  return {
    getEnv: (...keys: string[]) => {
      for (const key of keys) if (process.env[key]) return process.env[key];
      return "";
    },
    isSupabaseConfigError: () => false,
    createSupabaseAdmin: () => ({
      from: table,
      rpc: (...args: unknown[]) => {
        state.rpc(...args);
        if (args[0] === "fn_login_resolve_email") {
          return Promise.resolve({
            data: state.resolvedEmail,
            error: state.resolveError,
          });
        }
        return Promise.resolve(
          args[0] === "fn_login_attempt_begin"
            ? state.beginResult
            : { data: null, error: null },
        );
      },
    }),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    state.createClient(...args);
    return { auth: { signInWithPassword: state.signIn } };
  },
}));

import handler from "./login.js";

type Captured = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

async function login(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Captured> {
  const captured: Captured = { status: 0, body: undefined, headers: {} };
  const res = {
    setHeader: (k: string, v: string) => {
      captured.headers[k] = v;
    },
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
    { method: "POST", headers, body } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const DECOY_EMAIL = "login-decoy-00000000@teacher.schoolmentor.kr";

function sha256Param(value: string): string {
  return `\\x${createHash("sha256").update(value).digest("hex")}`;
}

const INVALID_CREDENTIALS = {
  data: { session: null, user: null },
  error: {
    status: 400,
    code: "invalid_credentials",
    message: "Invalid login credentials",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "http://127.0.0.1:54421";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  state.beginResult = {
    data: [{ outcome: "proceed", attempt_no: 1, retry_after_s: 0 }],
    error: null,
  };
  state.resolvedEmail = null;
  state.teacher = null;
  state.resolveError = null;
  state.signIn.mockResolvedValue(INVALID_CREDENTIALS);
});

describe("POST /api/auth/login", () => {
  test("틀린 비밀번호는 401 INVALID 와 실패 횟수 문구를 주고 end(invalid)를 부른다", async () => {
    state.beginResult = {
      data: [{ outcome: "proceed", attempt_no: 2, retry_after_s: 0 }],
      error: null,
    };

    const r = await login({ identifier: "kim01", password: "wrong" });

    expect(r.status).toBe(401);
    expect(r.body).toEqual({
      error: {
        code: "INVALID",
        message: "아이디 또는 비밀번호가 올바르지 않습니다. (실패 2/5회)",
      },
      failCount: 2,
    });
    expect(state.rpc).toHaveBeenCalledWith("fn_login_attempt_end", {
      p_hash: expect.any(String),
      p_outcome: "invalid",
    });
  });

  test("성공하면 세션과 mustChangePassword 를 주고 end(success)를 부르며 첫 x-forwarded-for 를 Sb-Forwarded-For 로 보낸다", async () => {
    state.resolvedEmail = "kim01@teacher.schoolmentor.kr";
    state.teacher = { must_change_password: true };
    state.signIn.mockResolvedValue({
      data: {
        user: { id: "u1" },
        session: {
          access_token: "at",
          refresh_token: "rt",
          expires_at: 1234,
          user: { id: "u1" },
        },
      },
      error: null,
    });

    const r = await login(
      { identifier: " Kim01 ", password: "pw" },
      { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    );

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      session: { access_token: "at", refresh_token: "rt", expires_at: 1234 },
      mustChangePassword: true,
    });
    expect(state.rpc).toHaveBeenCalledWith("fn_login_resolve_email", {
      p_username: "kim01",
    });
    expect(state.signIn).toHaveBeenCalledWith({
      email: "kim01@teacher.schoolmentor.kr",
      password: "pw",
    });
    expect(state.rpc).toHaveBeenLastCalledWith("fn_login_attempt_end", {
      p_hash: expect.any(String),
      p_outcome: "success",
    });
    expect(state.createClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54421",
      "sb_secret_test",
      expect.objectContaining({
        global: { headers: { "Sb-Forwarded-For": "1.2.3.4" } },
      }),
    );
  });

  test("잠금 중이면 429 LOCKED 와 남은 분(올림)을 주고 GoTrue 와 end 를 부르지 않는다", async () => {
    state.beginResult = {
      data: [{ outcome: "locked", attempt_no: 5, retry_after_s: 301 }],
      error: null,
    };

    const r = await login({ identifier: "kim01", password: "pw" });

    expect(r.status).toBe(429);
    expect(r.body).toEqual({
      error: {
        code: "LOCKED",
        message:
          "로그인에 5회 연속 실패하여 10분 동안 로그인할 수 없습니다. 약 6분 후에 다시 시도해 주세요.",
      },
    });
    expect(r.headers["Retry-After"]).toBe("301");
    expect(state.signIn).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalledWith(
      "fn_login_attempt_end",
      expect.anything(),
    );
  });

  test.each([
    ["GoTrue 429", { status: 429, code: "over_request_rate_limit" }],
    ["GoTrue 5xx", { status: 502, code: "unexpected_failure" }],
    ["네트워크 오류", { status: 0, name: "AuthRetryableFetchError" }],
  ])(
    "%s 는 503 RETRY 를 주고 end(error)로 이번 시도를 취소한다",
    async (_name, error) => {
      state.signIn.mockResolvedValue({
        data: { session: null, user: null },
        error,
      });

      const r = await login({ identifier: "kim01", password: "pw" });

      expect(r.status).toBe(503);
      expect(r.body).toEqual({
        error: { code: "RETRY", message: "잠시 후 다시 시도해 주세요." },
      });
      expect(state.rpc).toHaveBeenLastCalledWith("fn_login_attempt_end", {
        p_hash: expect.any(String),
        p_outcome: "error",
        p_attempt_no: 1,
      });
    },
  );

  test("차단된 계정(user_banned)은 INVALID 로 매핑되고 실패로 센다", async () => {
    state.signIn.mockResolvedValue({
      data: { session: null, user: null },
      error: { status: 403, code: "user_banned", message: "User is banned" },
    });

    const r = await login({ identifier: "kim01", password: "pw" });

    expect(r.status).toBe(401);
    expect(r.body).toEqual({
      error: {
        code: "INVALID",
        message: "아이디 또는 비밀번호가 올바르지 않습니다. (실패 1/5회)",
      },
      failCount: 1,
    });
    expect(state.rpc).toHaveBeenLastCalledWith("fn_login_attempt_end", {
      p_hash: expect.any(String),
      p_outcome: "invalid",
    });
  });

  test("@ 가 들어 있으면 이메일로 그대로 GoTrue 에 보낸다", async () => {
    await login({ identifier: " Parent@Example.com ", password: "pw" });

    expect(state.signIn).toHaveBeenCalledWith({
      email: "parent@example.com",
      password: "pw",
    });
  });

  test("@ 없는 학생 아이디는 profiles.username 으로 찾은 이메일로 보낸다", async () => {
    state.resolvedEmail = "stu@example.com";

    await login({ identifier: "STU01", password: "pw" });

    expect(state.signIn).toHaveBeenCalledWith({
      email: "stu@example.com",
      password: "pw",
    });
  });

  test("합성 도메인으로 끝나는 식별자는 모르는 아이디로 보고 실패로 세되 GoTrue 에는 고정된 없는 주소로 한 번 묻는다", async () => {
    const r = await login({
      identifier: "kim01@teacher.schoolmentor.kr",
      password: "pw",
    });

    expect(r.status).toBe(401);
    expect(r.body).toEqual({
      error: {
        code: "INVALID",
        message: "아이디 또는 비밀번호가 올바르지 않습니다. (실패 1/5회)",
      },
      failCount: 1,
    });
    expect(state.signIn).toHaveBeenCalledTimes(1);
    expect(state.signIn).toHaveBeenCalledWith({
      email: DECOY_EMAIL,
      password: "pw",
    });
    expect(state.rpc).toHaveBeenLastCalledWith("fn_login_attempt_end", {
      p_hash: expect.any(String),
      p_outcome: "invalid",
    });
  });

  test("모르는 아이디도 알려진 아이디와 같이 GoTrue 를 한 번 부른다(응답 시간 평준화)", async () => {
    state.resolvedEmail = null;
    await login({ identifier: "nobody", password: "pw" });
    expect(state.signIn).toHaveBeenCalledTimes(1);
    expect(state.signIn).toHaveBeenLastCalledWith({
      email: DECOY_EMAIL,
      password: "pw",
    });

    state.resolvedEmail = "kim01@teacher.schoolmentor.kr";
    await login({ identifier: "kim01", password: "pw" });
    expect(state.signIn).toHaveBeenCalledTimes(2);
    expect(state.signIn).toHaveBeenLastCalledWith({
      email: "kim01@teacher.schoolmentor.kr",
      password: "pw",
    });
  });

  test("고정된 없는 주소가 성공으로 돌아와도 로그인시키지 않는다", async () => {
    state.signIn.mockResolvedValue({
      data: {
        user: { id: "ghost" },
        session: { access_token: "at", refresh_token: "rt", expires_at: 1 },
      },
      error: null,
    });

    const r = await login({
      identifier: "kim01@teacher.schoolmentor.kr",
      password: "pw",
    });

    expect(r.status).toBe(401);
  });

  test("없는 아이디와 틀린 비밀번호는 상태와 본문이 같다", async () => {
    state.resolvedEmail = null;
    const unknown = await login({ identifier: "nobody", password: "pw" });
    state.resolvedEmail = "kim01@teacher.schoolmentor.kr";
    const wrong = await login({ identifier: "kim01", password: "bad" });

    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body).toEqual(wrong.body);
  });

  test("식별자는 trim 과 소문자로 정규화한 값으로 해시한다", async () => {
    await login({ identifier: " KIM01 ", password: "pw" });
    await login({ identifier: "kim01", password: "pw" });

    const hashes = state.rpc.mock.calls
      .filter((c) => c[0] === "fn_login_attempt_begin")
      .map((c) => (c[1] as { p_hash: string }).p_hash);
    expect(hashes[0]).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(hashes[0]).toBe(hashes[1]);
  });

  test("아이디와 그 계정의 이메일은 같은 잠금 열쇠를 쓴다(10번 추측 방지)", async () => {
    state.resolvedEmail = "stu@example.com";
    await login({ identifier: "STU01", password: "pw" });
    state.resolvedEmail = null;
    await login({ identifier: " Stu@Example.com ", password: "pw" });

    const hashes = state.rpc.mock.calls
      .filter((c) => c[0] === "fn_login_attempt_begin")
      .map((c) => (c[1] as { p_hash: string }).p_hash);
    expect(hashes[0]).toBe(sha256Param("stu@example.com"));
    expect(hashes[1]).toBe(hashes[0]);
  });

  test("계정이 없는 아이디는 식별자 자체를 열쇠로 쓴다", async () => {
    state.resolvedEmail = null;
    await login({ identifier: " Nobody ", password: "pw" });

    expect(state.rpc).toHaveBeenCalledWith("fn_login_attempt_begin", {
      p_hash: sha256Param("nobody"),
    });
  });

  test("5번째 실패는 429 LOCKED 로 잠금 문구를 준다", async () => {
    state.beginResult = {
      data: [{ outcome: "proceed", attempt_no: 5, retry_after_s: 600 }],
      error: null,
    };

    const r = await login({ identifier: "kim01", password: "bad" });

    expect(r.status).toBe(429);
    expect(r.body).toEqual({
      error: {
        code: "LOCKED",
        message:
          "로그인에 5회 연속 실패하여 10분 동안 로그인할 수 없습니다. 약 10분 후에 다시 시도해 주세요.",
      },
    });
    expect(r.headers["Retry-After"]).toBe("600");
  });

  test("begin 이 실패하면 503 RETRY 이고 GoTrue 를 부르지 않는다", async () => {
    state.beginResult = { data: null, error: { code: "XX000" } };

    const r = await login({ identifier: "kim01", password: "pw" });

    expect(r.status).toBe(503);
    expect(state.signIn).not.toHaveBeenCalled();
  });

  test("이메일 조회가 실패하면 503 RETRY 이고 시도를 세지 않으며 GoTrue 도 부르지 않는다", async () => {
    state.resolveError = { code: "XX000" };

    const r = await login({ identifier: "kim01", password: "pw" });

    expect(r.status).toBe(503);
    expect(state.signIn).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalledWith(
      "fn_login_attempt_begin",
      expect.anything(),
    );
  });

  test.each([
    ["본문 없음", undefined],
    ["빈 아이디", { identifier: "  ", password: "pw" }],
    ["빈 비밀번호", { identifier: "kim01", password: "" }],
    ["문자열 아님", { identifier: 1, password: "pw" }],
    ["너무 긴 아이디", { identifier: "a".repeat(101), password: "pw" }],
    ["너무 긴 비밀번호", { identifier: "kim01", password: "p".repeat(257) }],
  ])("%s 는 400 이고 시도를 세지 않는다", async (_name, body) => {
    const r = await login(body);

    expect(r.status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.signIn).not.toHaveBeenCalled();
  });
});
