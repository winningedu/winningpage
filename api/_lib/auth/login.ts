// 스쿨멘토 서버 로그인 흐름(식별자 정규화, 실패 잠금, GoTrue 비밀번호 로그인).
//
// 순서: begin(먼저 센다) -> 인증 이메일 결정 -> GoTrue 비밀번호 로그인 -> end.
// 비밀번호나 토큰은 로그에 남기지 않는다.

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../supabaseAdmin.js";

export const SYNTHETIC_DOMAIN = "teacher.schoolmentor.kr";
export const MAX_FAILS = 5;

export const INVALID_CODE = "INVALID";

export function invalidMessage(failCount: number): string {
  return `아이디 또는 비밀번호가 올바르지 않습니다. (실패 ${failCount}/${MAX_FAILS}회)`;
}

export const LOCKED_CODE = "LOCKED";

export function lockedMessage(retryAfterSeconds: number): string {
  return `로그인에 ${MAX_FAILS}회 연속 실패하여 10분 동안 로그인할 수 없습니다. 약 ${Math.ceil(retryAfterSeconds / 60)}분 후에 다시 시도해 주세요.`;
}

export const RETRY_CODE = "RETRY";
export const RETRY_MESSAGE = "잠시 후 다시 시도해 주세요.";

const RETRY_FAILURE = {
  ok: false,
  status: 503,
  code: RETRY_CODE,
  message: RETRY_MESSAGE,
} as const;

// 인증 서버 쪽 사정(429, 5xx, 네트워크)이면 비밀번호가 틀린 것이 아니다.
function isServerSideError(error: { status?: number | undefined }): boolean {
  const status = error.status;
  return !status || status === 429 || status >= 500;
}

export type LoginFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
  retryAfterSeconds?: number;
};

export type LoginSuccess = {
  ok: true;
  session: { access_token: string; refresh_token: string; expires_at: number };
  mustChangePassword: boolean;
};

export type LoginResult = LoginSuccess | LoginFailure;

export interface LoginInput {
  identifier: string;
  password: string;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{
    data: {
      user: { id: string } | null;
      session: {
        access_token: string;
        refresh_token: string;
        expires_at?: number;
      } | null;
    };
    error: { status?: number | undefined } | null;
  }>;
}

/** GoTrue 비밀번호 로그인용 서버 클라이언트. 요청자 IP 를 Sb-Forwarded-For 로 넘겨 인증 서버의 IP 제한이 사용자별로 걸리게 한다. */
export function createLoginAuthClient(ip: string | null | undefined) {
  return createClient(
    getEnv("WINNING_SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL"),
    getEnv("SUPABASE_SECRET_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: ip ? { "Sb-Forwarded-For": ip } : {} },
    },
  );
}

export const MAX_IDENTIFIER_LENGTH = 100;
export const MAX_PASSWORD_LENGTH = 256;

export function isValidLoginBody(
  body: unknown,
): body is { identifier: string; password: string } {
  if (!body || typeof body !== "object") return false;
  const { identifier, password } = body as Record<string, unknown>;
  return (
    typeof identifier === "string" &&
    typeof password === "string" &&
    identifier.trim().length > 0 &&
    identifier.length <= MAX_IDENTIFIER_LENGTH &&
    password.length > 0 &&
    password.length <= MAX_PASSWORD_LENGTH
  );
}

export function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

// bytea 는 PostgREST 에 \x 접두 hex 문자열로 보낸다.
function hashParam(normalized: string): string {
  return `\\x${createHash("sha256").update(normalized).digest("hex")}`;
}

// 인증에 쓸 이메일을 정한다. null 이면 모르는 식별자(GoTrue 를 부르지 않는다).
// P1/P2: 합성 이메일은 입력으로 받지 않고, @ 없는 식별자는 profiles.username 으로 찾는다.
async function resolveAuthEmail(
  admin: SupabaseClient,
  identifier: string,
): Promise<{ email: string | null; failed: boolean }> {
  if (identifier.includes("@")) {
    return {
      email: identifier.endsWith(`@${SYNTHETIC_DOMAIN}`) ? null : identifier,
      failed: false,
    };
  }

  const pattern = identifier.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await admin
    .from("profiles")
    .select("member_type, email, username")
    .ilike("username", pattern)
    .maybeSingle();
  if (error) return { email: null, failed: true };

  const synthetic = `${identifier}@${SYNTHETIC_DOMAIN}`;
  if (data?.member_type === "teacher")
    return { email: synthetic, failed: false };
  return { email: data?.email || synthetic, failed: false };
}

export async function attemptLogin(
  admin: SupabaseClient,
  input: LoginInput,
): Promise<LoginResult> {
  const identifier = normalizeIdentifier(input.identifier);
  const hash = hashParam(identifier);

  const { data, error: beginError } = await admin.rpc(
    "fn_login_attempt_begin",
    { p_hash: hash },
  );
  const begin = (
    data as
      | { outcome: string; attempt_no: number; retry_after_s: number }[]
      | null
  )?.[0];
  if (beginError || !begin) return RETRY_FAILURE;

  if (begin.outcome === "locked") {
    return {
      ok: false,
      status: 429,
      code: LOCKED_CODE,
      message: lockedMessage(begin.retry_after_s),
      retryAfterSeconds: begin.retry_after_s,
    };
  }

  const resolved = await resolveAuthEmail(admin, identifier);
  if (resolved.failed) {
    await admin.rpc("fn_login_attempt_end", {
      p_hash: hash,
      p_outcome: "error",
      p_attempt_no: begin.attempt_no,
    });
    return RETRY_FAILURE;
  }
  const email = resolved.email;

  let signed: Awaited<ReturnType<LoginInput["signIn"]>>["data"];
  let error: Awaited<ReturnType<LoginInput["signIn"]>>["error"];
  try {
    if (email === null) {
      signed = { user: null, session: null };
      error = { status: 400 };
    } else {
      ({ data: signed, error } = await input.signIn(email, input.password));
    }
  } catch {
    error = {};
    signed = { user: null, session: null };
  }

  if (!error && signed.session && signed.user) {
    await admin.rpc("fn_login_attempt_end", {
      p_hash: hash,
      p_outcome: "success",
    });
    const { data: teacher } = await admin
      .from("teachers")
      .select("must_change_password")
      .eq("profile_id", signed.user.id)
      .maybeSingle();
    return {
      ok: true,
      session: {
        access_token: signed.session.access_token,
        refresh_token: signed.session.refresh_token,
        expires_at: signed.session.expires_at ?? 0,
      },
      mustChangePassword: teacher?.must_change_password ?? false,
    };
  }

  if (error && isServerSideError(error)) {
    await admin.rpc("fn_login_attempt_end", {
      p_hash: hash,
      p_outcome: "error",
      p_attempt_no: begin.attempt_no,
    });
    return RETRY_FAILURE;
  }

  await admin.rpc("fn_login_attempt_end", {
    p_hash: hash,
    p_outcome: "invalid",
  });
  // 5번째 실패는 begin 이 이미 10분 잠금을 걸었다.
  if (begin.attempt_no >= MAX_FAILS) {
    return {
      ok: false,
      status: 429,
      code: LOCKED_CODE,
      message: lockedMessage(begin.retry_after_s),
      retryAfterSeconds: begin.retry_after_s,
    };
  }
  return {
    ok: false,
    status: 401,
    code: INVALID_CODE,
    message: invalidMessage(begin.attempt_no),
    extra: { failCount: begin.attempt_no },
  };
}
