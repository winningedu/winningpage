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

export type LoginFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
};

export type LoginResult = { ok: true } | LoginFailure;

export interface LoginInput {
  identifier: string;
  password: string;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: { status?: number } | null }>;
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
  const begin = (data as { attempt_no: number }[])[0]!;

  const email = `${identifier}@${SYNTHETIC_DOMAIN}`;
  await input.signIn(email, input.password);

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
