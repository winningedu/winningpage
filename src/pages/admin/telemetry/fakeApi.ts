// AI 계기판 테스트용 api 대체. vi.mock 팩토리가 이 파일을 불러오므로 컴포넌트를 import 하지 않는다.

import type { ZodType } from "zod";

export class FakeApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly detail: string;
  readonly problem?: { errors?: { path: string; message: string }[] };
  constructor(
    status: number | null,
    code: string,
    detail = code,
    errors?: { path: string; message: string }[],
  ) {
    super(detail);
    this.status = status;
    this.code = code;
    this.detail = detail;
    if (errors) this.problem = { errors };
  }
}

type Method = "GET" | "PUT";
interface RequestOptions {
  searchParams?: string | Record<string, string>;
  json?: unknown;
  signal?: AbortSignal;
}
type Handler = (options: RequestOptions) => unknown;

export const calls: {
  method: Method;
  path: string;
  options: RequestOptions;
}[] = [];
const handlers = new Map<string, Handler>();

function request(method: Method) {
  return (path: string, options: RequestOptions = {}) => {
    calls.push({ method, path, options });
    return {
      json: async (schema: ZodType) => {
        const handler = handlers.get(`${method} ${path}`);
        if (!handler) throw new Error(`mock 없음: ${method} ${path}`);
        return schema.parse(await handler(options));
      },
    };
  };
}

// vi.mock("@/lib/http/client", ...) 의 팩토리가 그대로 돌려주는 값
export const clientMock = {
  api: { get: request("GET"), put: request("PUT") },
  ApiError: FakeApiError,
};

export function on(method: Method, path: string, handler: unknown) {
  handlers.set(
    `${method} ${path}`,
    typeof handler === "function" ? (handler as Handler) : () => handler,
  );
}

export function resetApi() {
  calls.length = 0;
  handlers.clear();
}

export function callsTo(method: Method, path: string) {
  return calls.filter((c) => c.method === method && c.path === path);
}

/** 호출에 실린 쿼리 문자열을 키 값 객체로 푼다. */
export function paramsOf(call: { options: RequestOptions } | undefined) {
  const raw = call?.options.searchParams ?? "";
  return Object.fromEntries(new URLSearchParams(raw));
}
