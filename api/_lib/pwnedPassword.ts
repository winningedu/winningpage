// Supabase Auth 가 유출된 비밀번호(HIBP)로 거부한 오류를 서버 라우트들이 같은 방식으로
// 알아보고 같은 문구로 돌려주기 위한 공용 조각. api/ 는 src/ 를 import 할 수 없어
// src/lib/pwnedPassword.ts 와 같은 문구를 여기에 따로 둔다. 둘을 같이 고친다.

export const PASSWORD_PWNED_CODE = "PASSWORD_PWNED";

export const PWNED_PASSWORD_MESSAGE =
  "유출된 적 있는 비밀번호예요. 다른 비밀번호를 입력해 주세요.";

/** weak_password 는 길이/문자 규칙 위반에도 쓰이므로 reasons 에 "pwned" 가 있어야 한다. */
export function isPwnedAuthError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, name, reasons } = error as {
    code?: unknown;
    name?: unknown;
    reasons?: unknown;
  };
  const isWeakPassword =
    code === "weak_password" || name === "AuthWeakPasswordError";
  return isWeakPassword && Array.isArray(reasons) && reasons.includes("pwned");
}
