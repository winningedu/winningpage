// Hono 쪽 problem 응답. 바디는 sendError(..., "problem") 와 같은 problemBody 가 만든다(키 순서, code, 문구까지 같다).
// c.body 로 만들어 미들웨어가 c.header 로 건 헤더(옵션 headers 등)가 오류 응답에도 실린다.

import type { Context, Handler, NotFoundHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { PROBLEM_CONTENT_TYPE } from "../../../shared/http/problem.js";
import { problemBody } from "../httpResponse.js";

/** 핸들러와 미들웨어가 던지면 onError(handleError)가 problem 응답으로 바꾼다. */
export class ProblemError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | undefined,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ProblemError";
  }
}

export function problemResponse(
  c: Context,
  status: number,
  message: string,
  code?: string,
  extra?: Record<string, unknown>,
): Response {
  return c.body(
    problemBody(status, message, code, extra, c.req.header("x-vercel-id")),
    status as ContentfulStatusCode,
    { "Content-Type": PROBLEM_CONTENT_TYPE },
  );
}

/** defineHandler 의 검증 실패와 같은 400 VALIDATION_FAILED. */
export function validationFailed(
  c: Context,
  errors: { path: string; message: string }[],
): Response {
  return problemResponse(
    c,
    400,
    "요청 값이 올바르지 않아요.",
    "VALIDATION_FAILED",
    { errors },
  );
}

/** 루트 앱의 notFound. Hono 기본은 text 404 라 problem 으로 맞춘다(notFound 는 루트 앱에서만 불린다). */
export const notFound: NotFoundHandler = (c) =>
  problemResponse(c, 404, "요청한 주소를 찾을 수 없어요.", "NOT_FOUND");

/**
 * 라우트 메서드 핸들러들 뒤에 `.all(path, methodNotAllowed("GET", "POST"))` 로 단다. Hono 는 모르는 메서드를 404 로 보내기 때문이다.
 * 405 는 Allow 를 실어야 한다(RFC 9110 15.5.6). GET 이 있으면 Hono 가 HEAD 를 GET 으로 받으므로 HEAD 도 넣는다.
 */
export function methodNotAllowed(...methods: string[]): Handler {
  const allow = [
    ...methods,
    ...(methods.includes("GET") ? ["HEAD"] : []),
  ].sort();
  return (c) => {
    c.header("Allow", allow.join(", "));
    return problemResponse(c, 405, "Method not allowed", "METHOD_NOT_ALLOWED");
  };
}
