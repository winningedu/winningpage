// 가입용 Auth 사용자 생성. 학생의 실제 이메일을 인증 이메일로 쓰므로 fn_login_resolve_email 이 그대로 동작한다.

import type { SupabaseClient } from "@supabase/supabase-js";

export type SignupAuthUser =
  | {
      ok: true;
      userId: string;
      /** 이번 요청이 만든 사용자인가. 가입 확정이 실패하면 만든 사용자만 지운다. */
      created: boolean;
    }
  | { ok: false; reason: "email_taken" | "weak_password" };

// 인증 이메일이 이미 있을 때 가입을 끝내지 않은 일반 계정(이전 시도가 가입 확정 전에 끊김)인지 본다.
// 프로필이 없거나 관리자, 교사 같은 계정이면 다시 쓰지 않는다(비밀번호를 덮어쓰면 계정 탈취가 된다).
async function isAbandonedSignup(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("profiles")
    .select("member_type, role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("signup profile lookup failed");
  return !!data && data.member_type === null && data.role === "user";
}

/**
 * 학생의 실제 이메일로 확인된 Auth 사용자를 만든다. 이메일이 이미 있으면(email_exists) 가입을 끝내지 않은
 * 계정만 비밀번호를 이번 입력으로 맞춰 다시 쓰고, 그 밖에는 email_taken 이다.
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
    return { ok: true, userId: data.user.id, created: true };
  }
  if (error?.code === "weak_password") {
    return { ok: false, reason: "weak_password" };
  }
  if (error?.code !== "email_exists") {
    throw new Error("signup auth user create failed");
  }

  const { data: existingId, error: lookupError } = await admin.rpc(
    "fn_auth_user_id_by_email",
    { p_email: email },
  );
  if (lookupError || typeof existingId !== "string") {
    throw new Error("signup auth user lookup failed");
  }
  if (!(await isAbandonedSignup(admin, existingId))) {
    return { ok: false, reason: "email_taken" };
  }
  const { error: updateError } = await admin.auth.admin.updateUserById(
    existingId,
    { password },
  );
  if (updateError) throw new Error("signup auth user password sync failed");
  return { ok: true, userId: existingId, created: false };
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
