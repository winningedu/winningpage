// 서로 기다릴 필요 없는 읽기를 함께 시작하고, 결과는 적은 순서대로 본다.
// Promise.all 은 시간상 먼저 던진 오류를 내지만, 읽기를 차례로 await 하던 코드는 앞선 읽기의 오류가 응답이 된다.
// 이 함수는 뒤 읽기가 먼저 실패해도 앞 읽기의 오류를 던져서 응답 순서를 그대로 지킨다.

type Reads<T extends readonly unknown[]> = {
  [K in keyof T]: PromiseLike<T[K]>;
};

export async function allInOrder<T extends readonly unknown[]>(
  ...reads: Reads<T>
): Promise<T> {
  const settled = await Promise.allSettled(reads);
  const values: unknown[] = [];
  for (const result of settled) {
    if (result.status === "rejected") throw result.reason;
    values.push(result.value);
  }
  return values as unknown as T;
}
