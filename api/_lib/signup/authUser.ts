// 가입용 Auth 사용자 생성. 학생의 실제 이메일을 인증 이메일로 쓰므로 fn_login_resolve_email 이 그대로 동작한다.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SignupAuthUser {
  userId: string;
  /** 이번 요청이 만든 사용자인가. 가입 확정이 실패하면 만든 사용자만 지운다. */
  created: boolean;
}

export async function createSignupAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<SignupAuthUser> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("signup auth user create failed");
  return { userId: data.user.id, created: true };
}

/**
 * 가입 확정이 실패해 남은 Auth 사용자를 지운다(profiles 는 ON DELETE CASCADE).
 * 지우기가 실패해도 원래 오류 응답을 가리지 않도록 로그만 남긴다. 사용자 id 만 적고 이메일은 적지 않는다.
 */
export async function discardSignupAuthUser(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  } catch (error) {
    console.error("[signup] auth user cleanup failed", { userId, error });
  }
}
