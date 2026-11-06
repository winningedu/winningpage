import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkDiagnosisAccess,
  consumeDiagnosisAttempt,
} from "./diagnosisAccess";

const apiFetchMock = vi.hoisted(() => vi.fn());
const gateState = vi.hoisted(() => ({ on: false }));

vi.mock("@/config/site", async (orig) => {
  const actual = await orig<typeof import("@/config/site")>();
  return {
    ...actual,
    site: {
      ...actual.site,
      features: {
        ...actual.site.features,
        get tenantServiceGate() {
          return gateState.on;
        },
      },
    },
  };
});

vi.mock("./apiFetch", () => ({
  apiFetch: apiFetchMock,
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
}));

beforeEach(() => {
  apiFetchMock.mockReset();
  gateState.on = false;
});

const reply = (ok: boolean, body: unknown) =>
  apiFetchMock.mockResolvedValue({ ok, json: async () => body });

describe("checkDiagnosisAccess 기관 사유", () => {
  it("스쿨멘토 응답의 tenantReason 을 싣는다", async () => {
    reply(true, { allowed: false, tenantReason: "catch_all" });
    const result = await checkDiagnosisAccess();
    expect(result.allowed).toBe(false);
    expect(result.tenantReason).toBe("catch_all");
  });

  it("위닝 응답은 tenantReason 이 null 이다", async () => {
    reply(true, { allowed: false });
    expect((await checkDiagnosisAccess()).tenantReason).toBeNull();
  });
});

describe("consumeDiagnosisAttempt 기관 사유", () => {
  it("거부 응답의 tenantReason 을 blocked 에 싣는다", async () => {
    reply(false, {
      error: { code: "QUOTA_EXHAUSTED", message: "x" },
      tenantReason: "month_cap",
    });
    expect(await consumeDiagnosisAttempt("a1")).toMatchObject({
      outcome: "blocked",
      tenantReason: "month_cap",
    });
  });
});

describe("스쿨멘토는 판정 실패를 열어 주지 않는다", () => {
  it("진입 확인이 5xx 면 checkFailed 로 막는다", async () => {
    gateState.on = true;
    reply(false, {});
    expect(await checkDiagnosisAccess()).toMatchObject({
      allowed: false,
      checkFailed: true,
    });
  });

  it("진입 확인 호출이 던져도 checkFailed 로 막는다", async () => {
    gateState.on = true;
    apiFetchMock.mockRejectedValue(new Error("network"));
    expect(await checkDiagnosisAccess()).toMatchObject({
      allowed: false,
      checkFailed: true,
    });
  });

  it("제출 소진이 5xx 면 check-failed 로 막는다", async () => {
    gateState.on = true;
    reply(false, { error: { code: "INTERNAL" } });
    expect(await consumeDiagnosisAttempt("a1")).toEqual({
      outcome: "check-failed",
    });
  });

  it("위닝은 그대로 fail-open 이다", async () => {
    reply(false, { error: { code: "INTERNAL" } });
    expect(await consumeDiagnosisAttempt("a1")).toEqual({
      outcome: "fail-open",
    });
    expect(await checkDiagnosisAccess()).toMatchObject({
      allowed: true,
      checkFailed: false,
    });
  });
});
