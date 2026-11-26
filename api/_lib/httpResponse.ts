// 공통 에러 응답 — 프론트가 실제로 파싱하는 에러 바디 4종을 프리셋으로 묶는다.
//
// 이 4종은 기존 코드에 이미 흩어져 있던 로컬 `fail()` 22곳(시그니처 5종)이
// 실제로 내던 형태를 그대로 옮긴 것이다. 새 형태를 발명하지 않는다 —
// 여기서 바이트가 하나라도 달라지면 프론트 파싱이 깨진다.
//
//   detail   → { detail }                              (대부분의 라우트)
//   okDetail → { ok: false, detail }                    (change-phone 등 계정 라우트)
//   error    → { error }                                 (create-consult-request 등)
//   coded    → { error: { code, message }, ...extra }    ("performance식", extra는
//                                                          error 안이 아니라 최상위
//                                                          형제 키로 스프레드된다 —
//                                                          api/performance/*.ts의
//                                                          로컬 fail() 실제 구현 기준)
//   problem: RFC 9457 problem details (application/problem+json)

import { STATUS_CODES } from "node:http";
import type { VercelResponse } from "@vercel/node";
import { PROBLEM_CONTENT_TYPE } from "../../shared/http/problem.js";

export type ErrorShape = "detail" | "okDetail" | "error" | "coded" | "problem";

export function sendError(
  res: VercelResponse,
  shape: ErrorShape,
  status: number,
  message: string,
  code?: string,
  extra?: Record<string, unknown>,
): void {
  switch (shape) {
    case "detail":
      res.status(status).json({ detail: message, ...(extra || {}) });
      return;
    case "okDetail":
      res.status(status).json({ ok: false, detail: message, ...(extra || {}) });
      return;
    case "error":
      res.status(status).json({ error: message, ...(extra || {}) });
      return;
    case "coded":
      res.status(status).json({ error: { code, message }, ...(extra || {}) });
      return;
    case "problem":
      sendProblem(res, status, message, code, extra);
      return;
  }
}

function sendProblem(
  res: VercelResponse,
  status: number,
  message: string,
  code: string | undefined,
  extra: Record<string, unknown> | undefined,
): void {
  const requestId = res.req?.headers["x-vercel-id"];
  const body = problemBody(
    status,
    message,
    code,
    extra,
    typeof requestId === "string" ? requestId : undefined,
  );
  // res.json 은 Content-Type 을 덮어쓸 수 있어 end 로 직접 쓴다.
  res.setHeader("Content-Type", PROBLEM_CONTENT_TYPE);
  res.status(status).end(body);
}

/**
 * RFC 9457 problem 바디 문자열. sendError(..., "problem") 와 Hono 쪽(api/_lib/hono/problem.ts)이 같이 쓴다(키 순서까지 같게).
 * code 없는 호출은 500 만 INTERNAL_ERROR 로 받는다. 나머지는 호출부 실수이므로 던진다.
 */
export function problemBody(
  status: number,
  message: string,
  code?: string,
  extra?: Record<string, unknown>,
  requestId?: string,
): string {
  if (!code && status !== 500) {
    throw new Error(
      `sendError: problem shape 는 code 가 필요합니다 (${status}).`,
    );
  }
  // 표준 멤버는 extra 로 덮을 수 없다(instance 가 없는 경우 포함).
  const { instance: _instance, ...members } = extra || {};
  return JSON.stringify({
    ...members,
    type: "about:blank",
    title: STATUS_CODES[status],
    status,
    detail: message,
    ...(requestId !== undefined ? { instance: requestId } : {}),
    code: code || "INTERNAL_ERROR",
  });
}
