// 서비스 루트 앱의 공통 층: 원문 경로 검사, 요청 로그, JSON charset, notFound, onError. 영역 앱은 .route() 로 붙인다(api/_routes/app.ts).

import { rawRouteKey } from "../../_routes/dispatch.js";
import { handleError } from "./error.js";
import { baseFactory } from "./factory.js";
import { requestLog } from "./log.js";
import { notFoundHandler } from "./problem.js";
import { rawPath } from "./request.js";

/**
 * dispatch 와 같은 원문 경로 검사. 빈 구간, ".", "..", 역슬래시, "%", 대괄호가 있으면 라우트를 찾지 않고 404 다.
 * Request 는 URL 을 표준대로 정규화하므로 보통은 rewrite 의 lookahead 가 먼저 막는다. 원문이 그대로 오는 런타임을 위한 두 번째 줄이다.
 */
const pathGuard = baseFactory.createMiddleware(async (c, next) => {
  if (rawRouteKey(rawPath(c)) === undefined) return c.notFound();
  await next();
});

/** c.json 은 application/json 만 보낸다. Vercel res.json 과 같은 값으로 맞춘다. */
const jsonCharset = baseFactory.createMiddleware(async (c, next) => {
  await next();
  if (c.res.headers.get("content-type") === "application/json") {
    c.res.headers.set("content-type", "application/json; charset=utf-8");
  }
});

export const createRootApp = () =>
  baseFactory
    .createApp()
    .use(pathGuard, requestLog, jsonCharset)
    .notFound(notFoundHandler)
    .onError(handleError);
