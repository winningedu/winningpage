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
});
