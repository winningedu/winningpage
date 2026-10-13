// 응답을 보낸 뒤에 이어서 돌릴 부가 작업을 예약한다.
//
// Vercel 런타임 안에서는 `@vercel/functions` 의 waitUntil 이 함수 인스턴스를
// 작업이 끝날 때까지 살려 둔다. 런타임 밖(테스트, 로컬 tsx, 요청 컨텍스트가 없는 경우)에서는
// waitUntil 이 요청 컨텍스트를 찾지 못해 아무것도 하지 않고 undefined 를 돌려준다
// (wait-until.js 의 `getContext().waitUntil?.(promise)`, get-context.js 는 컨텍스트가 없으면 `{}`).
// 작업 promise 는 넘기기 전에 이미 만들어져 실행 중이므로 그 경우에도 작업은 그대로 돈다.
// 작업 실패는 부가 기능 실패라 여기서 삼켜 처리되지 않은 거부를 남기지 않는다.

import { waitUntil } from "@vercel/functions";

export function scheduleAfterResponse(work: () => Promise<unknown>): void {
  let started: Promise<unknown>;
  try {
    started = work();
  } catch (error) {
    started = Promise.reject(error);
  }
  const task = Promise.resolve(started).then(
    () => undefined,
    (error) => {
      console.warn("[after-response] 응답 뒤 작업 실패:", error);
    },
  );
  waitUntil(task);
}
