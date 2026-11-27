// 기관 라우트 테스트용. 예전 핸들러 테스트가 쓰던 callHandler(핸들러, 본문, 메서드, 쿼리) 모양으로 Hono 루트 앱의 라우트를 부른다.

import {
  type Captured,
  callRoute,
  type HonoRoute,
} from "./adminRoute.testkit.js";

export function callHandler(
  route: HonoRoute,
  body: unknown,
  method = "POST",
  query: Record<string, string> = {},
): Promise<Captured> {
  // GET, HEAD 요청은 본문을 실을 수 없다.
  const hasBody = method !== "GET" && method !== "HEAD";
  return callRoute(route, {
    method,
    query,
    headers: { authorization: "Bearer token" },
    ...(hasBody ? { body } : {}),
  });
}
