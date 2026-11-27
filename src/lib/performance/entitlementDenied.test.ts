// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestDesignReport } from "./designReport";
import { finalizeSubmission, requestEvaluation } from "./evaluation";
import { recommendTopics } from "./topics";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

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

const BUY = "유료 이용권을 결제하신 뒤 이용할 수 있습니다.";
const DISABLED = "기관에서 제공하지 않는 서비스예요.";
const TERM_CAP = "이번 학기 이용 횟수를 모두 썼어요. 선생님께 문의해 주세요.";

const calls = {
  evaluate: () =>
    requestEvaluation({ accessToken: "t", sessionId: "s", submissionId: "x" }),
  finalize: () =>
    finalizeSubmission({
      accessToken: "t",
      sessionId: "s",
      submissionId: "x",
      action: "confirm",
    }),
  design: () =>
    requestDesignReport({ accessToken: "t", sessionId: "s", topicId: "p" }),
  topics: () => recommendTopics({ accessToken: "t", sessionId: "s" }),
};

function deny(extra: object = {}) {
  failWithProblem(403, { code: "NO_ENTITLEMENT", detail: BUY, ...extra });
}

beforeEach(() => {
  siteState.tenantServiceGate = false;
});

describe.each(Object.entries(calls))("%s 이용권 거부 문구", (_name, call) => {
  it("위닝은 서버 문구를 그대로 쓴다", async () => {
    deny({ tenantReason: "term_cap" });
    const error = await call().catch((e) => e);
    expect(error.userMessage).toBe(BUY);
  });

  it("스쿨멘토는 결제 안내 대신 사유에 맞는 결정 99 문구를 쓴다", async () => {
    siteState.tenantServiceGate = true;
    deny({ tenantReason: "term_cap" });
    const error = await call().catch((e) => e);
    expect(error.userMessage).toBe(TERM_CAP);
    expect(error.code).toBe("NO_ENTITLEMENT");
  });

  it("스쿨멘토에서 서버가 사유를 주지 못하면 제공하지 않는 서비스 문구를 쓴다", async () => {
    siteState.tenantServiceGate = true;
    deny();
    const error = await call().catch((e) => e);
    expect(error.userMessage).toBe(DISABLED);
  });
});
