import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestDesignReport } from "./designReport";
import { finalizeSubmission, requestEvaluation } from "./evaluation";
import { recommendTopics } from "./topics";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("./apiClient", () => ({
  AI_CALL_TIMEOUT_MS: 1,
  fetchWithTimeout: fetchMock,
}));

const BUY = "유료 이용권을 결제하신 뒤 이용할 수 있습니다.";
const DISABLED = "소속 기관에서 제공하지 않는 서비스예요.";
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
  fetchMock.mockResolvedValue({
    ok: false,
    json: async () => ({
      error: { code: "NO_ENTITLEMENT", message: BUY },
      ...extra,
    }),
  });
}

beforeEach(() => {
  siteState.tenantServiceGate = false;
  fetchMock.mockReset();
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
