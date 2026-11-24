// 어드민 화면 테스트용 api 대체(GET, POST, PATCH, DELETE). vi.mock 팩토리가 이 파일을 불러오므로 컴포넌트를 import 하지 않는다.

import type { ZodType } from "zod";

export class FakeApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly detail: string;
  constructor(status: number | null, code: string, detail = code) {
    super(detail);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";
interface RequestOptions {
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
    const run = async () => {
      const handler = handlers.get(`${method} ${path}`);
      if (!handler) throw new Error(`mock 없음: ${method} ${path}`);
      return handler(options);
    };
    const response = run();
    return Object.assign(response, {
      json: async (schema: ZodType) => schema.parse(await response),
    });
  };
}

// vi.mock("@/lib/http/client", ...) 의 팩토리가 그대로 돌려주는 값
export const clientMock = {
  api: {
    get: request("GET"),
    post: request("POST"),
    patch: request("PATCH"),
    delete: request("DELETE"),
  },
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
