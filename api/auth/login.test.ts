// POST /api/auth/login 계약 검증(스쿨멘토 서버 로그인, 실패 잠금).
//
// defineHandler 가 만든 핸들러를 가짜 req/res 로 직접 호출한다. 관리자 클라이언트
// (begin/end rpc, profiles 조회)는 createSupabaseAdmin 모킹으로, GoTrue 비밀번호
// 로그인은 @supabase/supabase-js 의 createClient 모킹으로 바꿔 끼운다.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  beginResult: {
    data: [{ outcome: "proceed", attempt_no: 1, retry_after_s: 0 }],
    error: null,
  } as { data: unknown; error: unknown },
  profile: null as Record<string, unknown> | null,
  teacher: null as Record<string, unknown> | null,
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
      data: name === "profiles" ? state.profile : state.teacher,
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
  state.profile = null;
  state.teacher = null;
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
    state.profile = { member_type: "teacher", email: null, username: "kim01" };
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
    expect(state.rpc).toHaveBeenCalledTimes(1);
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
    state.profile = {
      member_type: "student",
      email: "stu@example.com",
      username: "stu01",
    };

    await login({ identifier: "STU01", password: "pw" });

    expect(state.signIn).toHaveBeenCalledWith({
      email: "stu@example.com",
      password: "pw",
    });
  });

  test("합성 도메인으로 끝나는 식별자는 모르는 아이디로 보고 GoTrue 를 부르지 않되 실패로 센다", async () => {
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
    expect(state.signIn).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenLastCalledWith("fn_login_attempt_end", {
      p_hash: expect.any(String),
      p_outcome: "invalid",
    });
  });

  test("없는 아이디와 틀린 비밀번호는 상태와 본문이 같다", async () => {
    state.profile = null;
    const unknown = await login({ identifier: "nobody", password: "pw" });
    state.profile = { member_type: "teacher", email: null, username: "kim01" };
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
});
