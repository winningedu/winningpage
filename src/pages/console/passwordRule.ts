// 새 비밀번호 규칙. 서버 checkNewPassword(api/_lib/console/teacherAccounts.ts)와 같다.
// 8자 이상 256자 이하, 영문자와 숫자를 모두 포함.

export const PASSWORD_RULE_ERROR = "8자 이상, 영문과 숫자를 함께 써 주세요";
export const PASSWORD_MISMATCH_ERROR = "새 비밀번호가 서로 다릅니다.";
export const SAVE_FAILED_MESSAGE =
  "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요";

const MAX_PASSWORD_LENGTH = 256;

export function violatesPasswordRule(password: string): boolean {
  return (
    password.length < 8 ||
    password.length > MAX_PASSWORD_LENGTH ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  );
}

const RULE_CODES = new Set([
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "PASSWORD_NO_LETTER",
  "PASSWORD_NO_DIGIT",
]);

export function isPasswordRuleCode(code: string | null): boolean {
  return code !== null && RULE_CODES.has(code);
}
