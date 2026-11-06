// 가입용 Auth 사용자 생성. 학생의 실제 이메일을 인증 이메일로 쓰므로 fn_login_resolve_email 이 그대로 동작한다.

import type { SupabaseClient } from "@supabase/supabase-js";

export type SignupAuthUser =
  | {
      ok: true;
      userId: string;
    }
  | { ok: false; reason: "email_taken" | "weak_password" };

/**
 * 학생의 실제 이메일로 확인된 Auth 사용자를 만든다. 이메일이 이미 있으면(email_exists) 어떤 계정이든
 * email_taken 이다. 기존 사용자를 다시 쓰거나 비밀번호를 건드리면 계정 탈취가 된다.
 */
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
  if (!error && data.user) {
    return { ok: true, userId: data.user.id };
  }
  if (error?.code === "weak_password") {
    return { ok: false, reason: "weak_password" };
  }
  if (error?.code !== "email_exists") {
    throw new Error("signup auth user create failed");
  }

  return { ok: false, reason: "email_taken" };
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
