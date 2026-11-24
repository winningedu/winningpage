// @vitest-environment jsdom
import { SchemaValidationError } from "ky";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

const getSession = vi.fn();
vi.mock("../supabase", () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  },
}));

import * as zone from "../time/zone";
import { browserTimeZone } from "../time/zone";
import { ApiError, api } from "./client";

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

  test("X-Time-Zone 에 브라우저 시간대를 싣는다", async () => {
    const spy = stubFetch();
    await api.get("x");
    expect(sentRequest(spy).headers.get("X-Time-Zone")).toBe(browserTimeZone());
  });

  test("호출부가 정한 X-Time-Zone 은 덮어쓰지 않는다", async () => {
    const spy = stubFetch();
    await api.get("x", { headers: { "X-Time-Zone": "UTC" } });
    expect(sentRequest(spy).headers.get("X-Time-Zone")).toBe("UTC");
  });

  test("브라우저 시간대가 올바르지 않으면 헤더를 생략한다", async () => {
    vi.spyOn(zone, "browserTimeZone").mockReturnValue("KST");
    const spy = stubFetch();
    await api.get("x");
    expect(sentRequest(spy).headers.has("X-Time-Zone")).toBe(false);
  });

  test("problem 바디는 code, detail, supportCode(instance)를 가진 ApiError 가 된다", async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({
            type: "about:blank",
            title: "Forbidden",
            status: 403,
            detail: "권한이 없어요.",
            instance: "icn1::abc",
            code: "FORBIDDEN",
            errors: [{ path: "a", message: "b" }],
          }),
          {
            status: 403,
            headers: {
              "content-type": "application/problem+json",
              "x-vercel-id": "icn1::header",
            },
          },
        ),
    );
    const error = await api.get("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: "ApiError",
      status: 403,
      code: "FORBIDDEN",
      detail: "권한이 없어요.",
      message: "권한이 없어요.",
      title: "Forbidden",
      supportCode: "icn1::abc",
    });
    expect((error as ApiError).problem?.errors).toEqual([
      { path: "a", message: "b" },
    ]);
  });

  test("problem 이 아닌 500 은 HTTP_500 과 응답 헤더 supportCode 로 변환된다", async () => {
    stubFetch(
      async () =>
        new Response("<html>oops</html>", {
          status: 500,
          headers: {
            "content-type": "text/html",
            "x-vercel-id": "icn1::hdr",
          },
        }),
    );
    const error = await api.get("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 500,
      code: "HTTP_500",
      detail: "요청을 처리하지 못했어요.",
      supportCode: "icn1::hdr",
    });
  });

  test("시간 안에 끝나지 않으면 TIMEOUT ApiError 가 된다", async () => {
    stubFetch(
      () =>
        new Promise<Response>(() => {
          // 끝나지 않는 요청
        }),
    );
    const error = await api.get("x", { timeout: 20 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: null,
      code: "TIMEOUT",
      detail: "요청이 시간 내에 끝나지 않았어요.",
    });
  });

  test("네트워크 실패는 NETWORK ApiError 가 된다", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = await api.get("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: null,
      code: "NETWORK",
      detail: "네트워크에 연결하지 못했어요.",
    });
  });

  test("503 GET 도 재시도 없이 fetch 를 한 번만 부른다", async () => {
    const spy = stubFetch(async () => new Response("", { status: 503 }));
    await api.get("x").catch(() => undefined);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test(".json(schema)는 스키마에 맞는 응답을 통과시킨다", async () => {
    stubFetch(async () => Response.json({ name: "a" }));
    const body = await api.get("x").json(z.object({ name: z.string() }));
    expect(body).toEqual({ name: "a" });
  });

  test(".json(schema)는 스키마에 맞지 않는 응답을 던진다", async () => {
    stubFetch(async () => Response.json({ name: 1 }));
    await expect(
      api.get("x").json(z.object({ name: z.string() })),
    ).rejects.toBeInstanceOf(SchemaValidationError);
  });
});
