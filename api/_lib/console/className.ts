/**
 * 반 이름 규칙. 학교와 학원 모두 숫자만 받는다. fn_normalize_class_name 과 같다.
 * 바깥 공백을 지우고, 끝의 "반" 한 번을 떼고, 앞의 0 을 떼어 1 이상의 정수 문자열이면 그 값을, 아니면 빈 문자열을 돌려준다.
 */
export function normalizeClassName(raw: string): string {
  const digits = raw.trim().replace(/반$/, "").replace(/^0+/, "");
  return /^[1-9][0-9]*$/.test(digits) ? digits : "";
}
