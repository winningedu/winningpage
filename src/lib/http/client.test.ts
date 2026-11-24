// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const getSession = vi.fn();
vi.mock("../supabase", () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  },
}));

import { api } from "./client";

// Node 의 Request 는 상대 URL 을 해석하지 못한다(브라우저는 location 기준으로 해석).
// 브라우저 동작을 흉내 내려고 문서 주소를 기준으로 풀어 준다.
function stubBrowserRequest() {
  const NodeRequest = Request;
  vi.stubGlobal(
    "Request",
    class extends NodeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(
          typeof input === "string" ? new URL(input, location.href) : input,
          init,
        );
      }
    },
  );
}

function stubFetch(
  respond: () => Promise<Response> = async () =>
    new Response("{}", { headers: { "content-type": "application/json" } }),
) {
  const spy = vi.fn(async (_request: Request) => respond());
  vi.stubGlobal("fetch", spy);
  return spy;
}

function sentRequest(spy: ReturnType<typeof stubFetch>): Request {
  const request = spy.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw new Error("fetch가 호출되지 않음");
  return request;
}

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: null } });
  stubBrowserRequest();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  getSession.mockReset();
});

describe("api", () => {
  test("상대 경로 요청은 /api 접두사를 붙여 보낸다", async () => {
    const spy = stubFetch();
    await api.get("admin/x");
    expect(new URL(sentRequest(spy).url).pathname).toBe("/api/admin/x");
  });

  test("세션이 있으면 Bearer 토큰을 붙인다", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "u1" }, access_token: "tok-1" } },
    });
    const spy = stubFetch();
    await api.get("x");
    expect(sentRequest(spy).headers.get("Authorization")).toBe("Bearer tok-1");
  });

  test("세션이 없으면 Authorization 헤더를 붙이지 않는다", async () => {
    const spy = stubFetch();
    await api.get("x");
    expect(sentRequest(spy).headers.has("Authorization")).toBe(false);
  });
});
