// 유출된 비밀번호 확인 (Have I Been Pwned range API, 키 불필요).
//
// k-anonymity: 비밀번호의 SHA-1 앞 5자리만 보내고, 돌려받은 목록에서 나머지를
// 브라우저가 직접 비교한다. 비밀번호 원문과 전체 해시는 밖으로 나가지 않는다.
// 조회가 실패하면 막지 않는다("unknown"). 저장 시점에는 Supabase가 다시 판정한다.

export const PWNED_PASSWORD_MESSAGE =
  "유출된 적 있는 비밀번호예요. 다른 비밀번호를 입력해 주세요.";

// 서버(콘솔 API)가 유출된 비밀번호로 거부할 때 돌려주는 오류 코드.
export const PASSWORD_PWNED_CODE = "PASSWORD_PWNED";

export type PwnedCheckResult = "pwned" | "ok" | "unknown";

const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 3000;

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
}

export async function checkPwnedPassword(
  password: string,
): Promise<PwnedCheckResult> {
  if (!password) return "ok";

  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const response = await fetch(RANGE_URL + prefix, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return "unknown";

    const text = await response.text();
    // 각 줄은 "SUFFIX:COUNT". COUNT 0은 응답 크기를 맞추려고 섞은 가짜 줄이다.
    const pwned = text.split(/\r?\n/).some((line) => {
      const [lineSuffix, count] = line.trim().split(":");
      return lineSuffix?.toUpperCase() === suffix && Number(count) > 0;
    });

    return pwned ? "pwned" : "ok";
  } catch {
    return "unknown";
  }
}

/**
 * 저장 시점에 Supabase가 유출 비밀번호로 거부한 오류인지 판별한다.
 * weak_password 는 길이/문자 규칙 위반에도 쓰이므로 reasons 에 "pwned" 가 있어야 한다.
 */
export function isPwnedPasswordError(error: unknown): boolean {
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
