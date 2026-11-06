import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEntitlement } from "./entitlement";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./apiFetch", () => ({
  apiFetch: apiFetchMock,
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
}));

const reply = (body: unknown) =>
  apiFetchMock.mockResolvedValue({ ok: true, json: async () => body });

beforeEach(() => apiFetchMock.mockReset());

describe("fetchEntitlement 기관 사유", () => {
  it("스쿨멘토 응답의 tenantReason 과 limitKind 를 그대로 싣는다", async () => {
    reply({
      allowed: true,
      quotaRemaining: 0,
      quotaTotal: 3,
      planEndsAt: "2026-12-01",
      planLabel: null,
      tenantReason: "month_cap",
      limitKind: "month",
    });
    const result = await fetchEntitlement("growth");
    expect(result.tenantReason).toBe("month_cap");
    expect(result.limitKind).toBe("month");
  });

  it("위닝 응답에는 두 필드가 없어 null 이다", async () => {
    reply({ allowed: false });
    const result = await fetchEntitlement("growth");
    expect(result.tenantReason).toBeNull();
    expect(result.limitKind).toBeNull();
  });
});
