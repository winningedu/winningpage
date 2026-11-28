// 읽기를 지금 시작해 두고 결과는 나중에 원래 순서대로 await 한다.
// 앞선 확인이 먼저 응답을 정해 이 읽기를 끝내 보지 않아도, 그 거부가 처리되지 않은 거부로 남지 않게 붙여 둔다.
// 나중에 await 하면 값이나 오류가 그대로 나온다. 쿼리 빌더처럼 then 을 부를 때 시작하는 값도 여기서 시작된다.

export function startEarly<T>(read: PromiseLike<T>): Promise<T> {
  const started = Promise.resolve(read);
  started.catch(() => {});
  return started;
}
