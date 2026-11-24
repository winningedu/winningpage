// 브라우저 전용 HTTP 클라이언트. 재시도는 react-query가 맡으므로 ky retry 는 끈다.

import ky, { isHTTPError, isTimeoutError } from "ky";
import { supabase } from "../supabase";
import { browserTimeZone, isValidTimeZone } from "../time/zone";
import { type Problem, problemSchema } from "./problem";

/** 화면이 다루는 실패는 이 에러 하나뿐이다. status 가 null 이면 서버 응답이 없었다는 뜻이다. */
export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly detail: string;
  readonly title?: string;
  readonly supportCode: string | null;
  readonly problem?: Problem;

  constructor(init: {
    status: number | null;
    code: string;
    detail: string;
    title?: string;
    supportCode?: string | null;
    problem?: Problem;
  }) {
    super(init.detail);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.title = init.title;
    this.supportCode = init.supportCode ?? null;
    this.problem = init.problem;
  }
}

export const api = ky.create({
  prefix: "/api",
  timeout: 15_000,
  retry: 0,
  hooks: {
    beforeRequest: [
      async ({ request }) => {
        // 세션이 없으면 헤더만 생략한다. 인증 여부 판단은 서버 몫이다.
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (session?.user && session.access_token)
          request.headers.set(
            "Authorization",
            `Bearer ${session.access_token}`,
          );

        // 호출부가 정한 값이 우선이다. 올바르지 않은 브라우저 값은 서버가 400 으로 막으므로 생략한다.
        const zone = browserTimeZone();
        if (!request.headers.has("X-Time-Zone") && isValidTimeZone(zone))
          request.headers.set("X-Time-Zone", zone);
      },
    ],
    beforeError: [
      ({ error }) => {
        if (isHTTPError(error)) {
          const parsed = problemSchema.safeParse(error.data);
          if (parsed.success) {
            const problem = parsed.data;
            return new ApiError({
              status: problem.status,
              code: problem.code,
              detail: problem.detail,
              title: problem.title,
              supportCode:
                problem.instance ?? error.response.headers.get("x-vercel-id"),
              problem,
            });
          }
          // 옛 에러 모양, HTML, 빈 바디는 상태 코드만 믿는다.
          return new ApiError({
            status: error.response.status,
            code: `HTTP_${error.response.status}`,
            detail: "요청을 처리하지 못했어요.",
            supportCode: error.response.headers.get("x-vercel-id"),
          });
        }
        if (isTimeoutError(error)) {
          return new ApiError({
            status: null,
            code: "TIMEOUT",
            detail: "요청이 시간 내에 끝나지 않았어요.",
          });
        }
        return error;
      },
    ],
  },
});
