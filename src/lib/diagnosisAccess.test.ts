import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkDiagnosisAccess,
  consumeDiagnosisAttempt,
} from "./diagnosisAccess";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./apiFetch", () => ({
  apiFetch: apiFetchMock,
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
}));

beforeEach(() => apiFetchMock.mockReset());

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
