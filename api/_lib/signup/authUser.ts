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
