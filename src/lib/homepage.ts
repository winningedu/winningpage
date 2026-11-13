// 홈페이지 주소 입력칸 공용. 비어 있으면 http:// 를 미리 채우고, 스킴만 남은 값은 제출할 때 빈 값으로 본다.

export const HOMEPAGE_PREFIX = "http://";

export function withoutBareScheme(value: string): string {
  return /^https?:\/\/$/.test(value.trim()) ? "" : value;
}
