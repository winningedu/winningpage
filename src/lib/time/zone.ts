/**
 * 시간대 이름 판별 (순수 함수, React 없음)
 *
 * api/ 도 상대 경로로 import 한다. `@/` 별칭을 쓰지 않는다.
 */

/** 브라우저(실행 환경)의 IANA 시간대 이름. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** IANA 이름과 UTC 만 true. 빈 값, 오프셋(+09:00), 약어(KST) 는 false. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz === "") return false;
  // 최신 엔진은 "+09:00" 같은 오프셋도 받아 주므로 먼저 걸러낸다.
  if (/^[+-]/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
