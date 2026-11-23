/** 반을 비워 적었거나 올바르지 않을 때 화면과 API 가 같이 쓰는 안내 문구. */
export const CLASS_NAME_INVALID_MESSAGE =
  "반은 숫자나 영문으로 적고, '반' 글자는 빼 주세요";

/**
 * 반 이름 규칙. 학교와 학원 모두 글자와 숫자를 받는다. fn_normalize_class_name 과 같다.
 * 바깥 공백만 지우고(안쪽 공백은 둔다), 끝의 "반" 한 번을 떼고, 남은 것이 숫자뿐이면 앞의 0 을 뗀다.
 * 비면 빈 문자열(올바르지 않은 반). 글자가 든 이름의 0 은 그대로 둔다("A01").
 */
export function normalizeClassName(raw: string): string {
  const rest = raw.trim().replace(/반$/, "").trim();
  return /^[0-9]+$/.test(rest) ? rest.replace(/^0+/, "") : rest;
}
