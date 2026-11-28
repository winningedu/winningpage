// 항목마다 하는 읽기를 한도만큼씩 함께 시작한다(스토리지처럼 한꺼번에 수백 번 부르면 안 되는 곳).
// 결과는 입력 순서이고, 오류는 입력 순서에서 앞선 항목의 것을 던진다(차례로 await 하던 때와 같은 응답).

import { allInOrder } from "./allInOrder.js";

export async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += limit) {
    const batch = items.slice(start, start + limit);
    results.push(
      ...(await allInOrder<R[]>(
        ...batch.map((item, offset) => fn(item, start + offset)),
      )),
    );
  }
  return results;
}
