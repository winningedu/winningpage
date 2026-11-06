// 콘솔 라우트의 쿼리스트링 읽기. 같은 키가 여러 번 오면 첫 값, 빈 문자열은 값이 없는 것으로 본다.

export function queryValue(
  raw: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}
