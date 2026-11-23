/** 반을 비워 적었을 때 화면과 API 가 같이 쓰는 안내 문구. */
export const CLASS_NAME_INVALID_MESSAGE = "반을 적어요";

/**
 * 반 이름 규칙. 학교와 학원 모두 글자와 숫자를 받는다. fn_normalize_class_name 과 같다.
 * 공백을 모두 지우고, 끝의 "반" 한 번을 떼고, 남은 것이 숫자뿐이면 앞의 0 을 뗀다. 비면 빈 문자열(올바르지 않은 반).
 */
export function normalizeClassName(raw: string): string {
  const rest = raw.replace(/\s+/g, "").replace(/반$/, "");
  return /^[0-9]+$/.test(rest) ? rest.replace(/^0+/, "") : rest;
}
