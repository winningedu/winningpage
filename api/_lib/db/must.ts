// Supabase 응답을 던지는 형태로 바꾸는 보조. growth 와 selfeval 이 함께 쓴다.

/** DB 오류를 던져 최상위 핸들러가 500 으로 처리하게 한다. */
export function must<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** must 와 같지만 쿼리를 받아 Promise 를 돌려준다. Promise.all 배열 안에서 읽기를 함께 시작할 때 쓴다. */
export async function mustRead<T>(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  return must(await query, what) as T;
}

/** 쓰기 직후 반환 행이 반드시 있어야 하는 호출용. 없으면 던진다. */
export function mustHave<T>(value: T, what: string): NonNullable<T> {
  if (value === null || value === undefined)
    throw new Error(`${what}: 결과 없음`);
  return value as NonNullable<T>;
}
