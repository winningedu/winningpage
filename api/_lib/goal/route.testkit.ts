// 목표관리 라우트 테스트용. 예전 핸들러 테스트가 만들던 가짜 req, res 대신 Hono 루트 앱(api/_routes/app.ts)으로 부른다.
// 쓰는 테스트 파일은 user() 인증을 통과시키려고 httpAuth.resolveUser 와 supabaseAdmin 을 vi.mock 으로 가짜로 둔다(vi.mock 은 파일마다 끌어올려야 한다).

import { type Captured, callRoute } from "../adminRoute.testkit.js";

export async function callGoal(
  route: string,
  request: {
    method?: string;
    query?: Record<string, string>;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<Captured> {
  const { app } = await import("../../_routes/app.js");
  return callRoute(
    { app, path: `/api/goal/${route}` },
    {
      method: "GET",
      ...request,
      headers: { authorization: "Bearer t", ...request.headers },
    },
  );
}
