// @vitest-environment jsdom
// performanceRequest: 서버 problem 실패를 예전 화면이 읽던 code, 문구, 확장 멤버로 돌려준다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { api } from "../http/client";
import { performanceRequest } from "./apiClient";

// ky 클라이언트(@/lib/http/client)는 세션의 토큰을 supabase 에서 읽는다. 진짜 ky 와 계약 스키마를 쓰고 fetch 만 가짜로 바꾼다.
vi.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "u1" }, access_token: "tok" } },
      }),
    },
  },
}));

const fetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  fetchMock.mockReset();
  // Node 의 Request 는 상대 URL 을 해석하지 못해서 브라우저처럼 문서 주소 기준으로 풀어 준다.
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
  vi.stubGlobal("fetch", (request: Request) => fetchMock(request));
});
afterEach(() => vi.unstubAllGlobals());

/** 서버의 problem 실패 응답. 부를 때마다 새 Response 를 만든다(본문은 한 번만 읽힌다). */
function failWithProblem(status: number, body: Record<string, unknown>) {
  fetchMock.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          type: "about:blank",
          title: "Error",
          status,
          ...body,
        }),
        { status, headers: { "content-type": "application/problem+json" } },
      ),
  );
}

const call = () =>
  performanceRequest(
    api.get("performance/x").json(z.looseObject({ ok: z.boolean() })),
  );

describe("performanceRequest", () => {
  it("성공이면 계약 스키마로 읽은 본문을 돌려준다", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        }),
    );
    expect(await call()).toEqual({ ok: true, data: { ok: true } });
  });

  it("problem 실패는 code, detail, 확장 멤버를 돌려준다", async () => {
    failWithProblem(409, {
      code: "TOO_MANY_ATTACHMENTS",
      detail: "안내문 사진은 최대 5장까지 올릴 수 있어요.",
      max: 5,
    });
    expect(await call()).toEqual({
      ok: false,
      status: 409,
      code: "TOO_MANY_ATTACHMENTS",
      message: "안내문 사진은 최대 5장까지 올릴 수 있어요.",
      extra: { max: 5 },
    });
  });

  it("처리되지 않은 500(INTERNAL_ERROR)은 예전 코드 INTERNAL 로 돌려준다", async () => {
    failWithProblem(500, { code: "INTERNAL_ERROR", detail: "x" });
    expect(await call()).toMatchObject({ ok: false, code: "INTERNAL" });
  });

  it("problem 이 아닌 본문은 문구 없이 UNKNOWN, 401 은 UNAUTHENTICATED 다", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 504 }));
    expect(await call()).toMatchObject({
      ok: false,
      status: 504,
      code: "UNKNOWN",
      message: null,
    });
    fetchMock.mockImplementation(async () => new Response("", { status: 401 }));
    expect(await call()).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("서버에 닿지 못한 실패는 던진다(호출부가 NETWORK 로 감싼다)", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(call()).rejects.toMatchObject({ code: "NETWORK" });
  });
});
