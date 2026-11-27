// defineHandler(auth:"user") 를 Hono 미들웨어로 옮긴 것. 로그인한 사용자 라우트(자기평가서 등)가 쓴다.
//
// 순서는 defineHandler 와 같다: 오류 문구, 응답 헤더, X-Time-Zone(잘못된 값은 인증보다 먼저 400), Bearer 토큰 인증(401 UNAUTHENTICATED).
//   라우트 파일마다 const guard = user({...}) 를 하나 만들어 메서드 라우트의 첫 미들웨어로 쓴다. QA 차단, 임시 비밀번호 확인, 읽기 전용 대행은 없다(auth:"user" 에 없다).

import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import { resolveUser } from "../httpAuth.js";
import { AUTH_REQUIRED_MESSAGE } from "../httpResponse.js";
import { createSupabaseAdmin } from "../supabaseAdmin.js";
import { readTimeZone } from "../timeZone.js";
import { type RouteOptions, registered } from "./admin.js";
import { userFactory } from "./factory.js";
import { ProblemError } from "./problem.js";
import { nodeHeaders } from "./request.js";

export const user = (options: RouteOptions) =>
  registered(
    userFactory.createMiddleware(async (c, next) => {
      c.set("unhandledMessage", options.unhandledMessage);
      c.set("logLabel", options.logLabel);
      for (const [key, value] of Object.entries(options.headers ?? {})) {
        c.header(key, value);
      }
      const timeZone = readTimeZone({ headers: nodeHeaders(c) });
      if (timeZone) c.set("timeZone", timeZone);

      const authed = await resolveUser({ headers: nodeHeaders(c) });
      if (!authed) {
        throw new ProblemError(
          401,
          AUTH_REQUIRED_MESSAGE,
          PROBLEM_CODE.UNAUTHENTICATED,
        );
      }
      c.set("userId", authed.userId);
      c.set("user", authed.user);
      c.set("token", authed.token);
      c.set("supabaseAdmin", createSupabaseAdmin());
      await next();
    }),
    { auth: "user" },
  );
