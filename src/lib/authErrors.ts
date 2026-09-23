// Supabase Auth 에러를 화면 분기용으로 판정하는 순수 함수 모음.
//
// FindPassword.tsx 전용이었던 isServerFailure를 여기로 옮겼다(2026-09-23,
// token_hash 전환 작업) — 같은 판정이 다른 화면에서도 필요해질 수 있어
// 공용 위치로 뺀다.

/**
 * "서버가 못 보낸 것"인지 판정한다. 계정 존재 여부와 무관한 실패만 true 다.
 *
 * 왜 구분하나 — 실제로 당한 사고 (2026-08-23)
 *   dev 의 SMTP 자격증명이 틀어져 `/auth/v1/recover` 가 **500** 을 뱉고 있었는데,
 *   FindPassword.tsx는 실패를 통째로 삼키고 "보냈어요"만 띄웠다. 메일은 한 통도
 *   안 나갔는데 사용자는 오지 않는 메일을 기다리며 스팸함만 뒤지게 된다 — 실제
 *   사용자였으면 계정을 영영 못 찾는다.
 *
 *   "계정이 없다"는 계속 숨겨야 맞다(그걸 구분해 보여주면 이메일 등록 여부를
 *   캐는 경로가 된다). 하지만 5xx 는 **어떤 계정 정보도 담고 있지 않으므로**
 *   사실대로 알려도 그 원칙이 깨지지 않는다.
 *
 * AuthRetryableFetchError 는 auth-js 가 네트워크 오류와 500·501·502·503·504,
 * Cloudflare 520~530 을 묶어 던지는 타입이다. status 를 못 읽는 경우까지 덮으려고
 * 이름과 status 둘 다 본다.
 */
export function isServerFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; status?: number };
  if (candidate.name === "AuthRetryableFetchError") return true;
  return typeof candidate.status === "number" && candidate.status >= 500;
}

/**
 * Supabase 발송 한도 초과(rate limit)인지 판정한다.
 *
 * isServerFailure와 구분하는 이유 — 429는 "서버 장애"가 아니라 "너무 자주
 * 요청했다"는 뜻이라 문구도 쿨다운 취급도 달라야 한다. isServerFailure가
 * 계정 존재 여부를 숨기려고 4xx를 전부 무시하는 것과 달리, 이쪽은 발송 자체가
 * 막힌 상태를 사실대로 알려야 하므로 429만 따로 본다. AuthApiError는 status와
 * code를 함께 채워 던지므로 둘 중 하나만 맞아도 rate limit으로 본다.
 */
export function isRateLimited(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; code?: string };
  if (candidate.status === 429) return true;
  return candidate.code === "over_email_send_rate_limit";
}
