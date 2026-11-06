import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitGoalIntake } from "./goalApi";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./apiFetch", () => ({
  apiFetch: apiFetchMock,
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
}));

beforeEach(() => apiFetchMock.mockReset());

describe("submitGoalIntake 이용 거부", () => {
  it("403 응답의 기관 거부 사유를 not-allowed 에 싣는다", async () => {
    apiFetchMock.mockResolvedValue({
      status: 403,
      ok: false,
      json: async () => ({ detail: "x", tenantReason: "grace" }),
    });
    expect(await submitGoalIntake({})).toEqual({
      kind: "not-allowed",
      tenantReason: "grace",
    });
  });

  it("위닝 403 은 사유가 null 이다", async () => {
    apiFetchMock.mockResolvedValue({
      status: 403,
      ok: false,
      json: async () => ({ detail: "x" }),
    });
    expect(await submitGoalIntake({})).toEqual({
      kind: "not-allowed",
      tenantReason: null,
    });
  });
});
