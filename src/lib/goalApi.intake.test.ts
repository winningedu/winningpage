// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitGoalIntake } from "./goalApi";

// ky 클라이언트(./http/client)는 세션의 토큰을 supabase 에서 읽는다. 진짜 ky 를 쓰고 fetch 만 가짜로 바꾼다.
vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "u1" }, access_token: "tok" } },
      }),
    },
  },
}));
vi.mock("./apiFetch", async () => ({
  ...(await vi.importActual<typeof import("./apiFetch")>("./apiFetch")),
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
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

/** 성공은 JSON, 실패는 서버처럼 problem 본문으로 답한다. 부를 때마다 새 Response 를 만든다. */
function respond(status: number, body: Record<string, unknown>) {
  fetchMock.mockImplementation(async () =>
    status < 400
      ? new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        })
      : new Response(
          JSON.stringify({
            type: "about:blank",
            title: "Forbidden",
            status,
            detail: "x",
            code: "NO_ENTITLEMENT",
            ...body,
          }),
          { status, headers: { "content-type": "application/problem+json" } },
        ),
  );
}

describe("submitGoalIntake 이용 거부", () => {
  it("403 응답의 기관 거부 사유를 not-allowed 에 싣는다", async () => {
    respond(403, { tenantReason: "grace" });
    expect(await submitGoalIntake({})).toEqual({
      kind: "not-allowed",
      tenantReason: "grace",
    });
  });

  it("위닝 403 은 사유가 null 이다", async () => {
    respond(403, {});
    expect(await submitGoalIntake({})).toEqual({
      kind: "not-allowed",
      tenantReason: null,
    });
  });
});
