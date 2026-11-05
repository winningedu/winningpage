// 스쿨멘토 서버 로그인 흐름(식별자 정규화, 실패 잠금, GoTrue 비밀번호 로그인).
//
// 순서: begin(먼저 센다) -> 인증 이메일 결정 -> GoTrue 비밀번호 로그인 -> end.
// 비밀번호나 토큰은 로그에 남기지 않는다.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

// bytea 는 PostgREST 에 \x 접두 hex 문자열로 보낸다.
function hashParam(normalized: string): string {
  return `\\x${createHash("sha256").update(normalized).digest("hex")}`;
}

export async function attemptLogin(
  admin: SupabaseClient,
  input: LoginInput,
): Promise<LoginResult> {
  const identifier = normalizeIdentifier(input.identifier);
  const hash = hashParam(identifier);

  const { data } = await admin.rpc("fn_login_attempt_begin", { p_hash: hash });
  const begin = (
    data as { outcome: string; attempt_no: number; retry_after_s: number }[]
  )[0] as { outcome: string; attempt_no: number; retry_after_s: number };

  if (begin.outcome === "locked") {
    return {
      ok: false,
      status: 429,
      code: LOCKED_CODE,
      message: lockedMessage(begin.retry_after_s),
      retryAfterSeconds: begin.retry_after_s,
    };
  }

  const email = `${identifier}@${SYNTHETIC_DOMAIN}`;
  let signed: Awaited<ReturnType<LoginInput["signIn"]>>["data"];
  let error: Awaited<ReturnType<LoginInput["signIn"]>>["error"];
  try {
    ({ data: signed, error } = await input.signIn(email, input.password));
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
    });
    return RETRY_FAILURE;
  }

  await admin.rpc("fn_login_attempt_end", {
    p_hash: hash,
    p_outcome: "invalid",
  });
  return {
    ok: false,
    status: 401,
    code: INVALID_CODE,
    message: invalidMessage(begin.attempt_no),
    extra: { failCount: begin.attempt_no },
  };
}
