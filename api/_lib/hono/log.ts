// 요청당 한 줄 로그. 토큰, 본문, 쿼리, 개인정보는 싣지 않는다. 키와 순서는 defineHandler 와 같다.

import { baseFactory } from "./factory.js";
import { rawPath } from "./request.js";

export const requestLog = baseFactory.createMiddleware(async (c, next) => {
  const startedAt = performance.now();
  await next();
  console.log(
    JSON.stringify({
      requestId: c.req.header("x-vercel-id") ?? null,
      route: rawPath(c),
      method: c.req.method,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
      userId: c.get("userId") ?? null,
    }),
  );
});
