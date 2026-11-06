import { beforeEach, describe, expect, it, vi } from "vitest";
import { recommendTopics } from "./topics";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("./apiClient", () => ({
  AI_CALL_TIMEOUT_MS: 1,
  fetchWithTimeout: fetchMock,
}));

beforeEach(() => fetchMock.mockReset());

async function failWith(body: unknown) {
  fetchMock.mockResolvedValue({ ok: false, json: async () => body });
  return recommendTopics({ accessToken: "t", sessionId: "s" }).catch((e) => e);
}

describe("recommendTopics 실패의 tenantReason", () => {
  it("스쿨멘토 한도 소진이면 tenantReason 을 싣는다", async () => {
    const error = await failWith({
      error: { code: "QUOTA_EXHAUSTED", message: "x" },
      tenantReason: "month_cap",
    });
    expect(error.code).toBe("QUOTA_EXHAUSTED");
    expect(error.tenantReason).toBe("month_cap");
  });

  it("위닝 응답은 tenantReason 이 null 이다", async () => {
    const error = await failWith({
      error: { code: "QUOTA_EXHAUSTED", message: "x" },
      quotaRemaining: 0,
    });
    expect(error.tenantReason).toBeNull();
  });
});
