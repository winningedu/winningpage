// Fetch 요청을 기존 서버 헬퍼가 읽는 모양으로 바꾼다.

import type { Context } from "hono";

/** Fetch 헤더를 소문자 키 객체로. 기존 헬퍼(getBearerToken, readTimeZone, resolveAdmin)가 이 모양을 읽는다. */
export function nodeHeaders(c: Context): Record<string, string> {
  return Object.fromEntries(c.req.raw.headers.entries());
}

/** 요청 주소에서 origin 과 쿼리를 뗀 원문 경로. defineHandler 의 req.url.split("?")[0] 과 같은 값이다. */
export function rawPath(c: Context): string {
  const url = c.req.url;
  const start = url.indexOf("/", url.indexOf("://") + 3);
  return (start === -1 ? "/" : url.slice(start)).split("?")[0] ?? "/";
}
