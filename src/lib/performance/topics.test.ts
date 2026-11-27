// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recommendTopics } from "./topics";

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

async function failWith(body: Record<string, unknown>) {
  failWithProblem(409, body);
  return recommendTopics({ accessToken: "t", sessionId: "s" }).catch((e) => e);
}

describe("recommendTopics 실패의 tenantReason", () => {
  it("스쿨멘토 한도 소진이면 tenantReason 을 싣는다", async () => {
    const error = await failWith({
      code: "QUOTA_EXHAUSTED",
      detail: "x",
      tenantReason: "month_cap",
    });
    expect(error.code).toBe("QUOTA_EXHAUSTED");
    expect(error.tenantReason).toBe("month_cap");
  });

  it("위닝 응답은 tenantReason 이 null 이다", async () => {
    const error = await failWith({
      code: "QUOTA_EXHAUSTED",
      detail: "x",
      quotaRemaining: 0,
    });
    expect(error.tenantReason).toBeNull();
  });
});
