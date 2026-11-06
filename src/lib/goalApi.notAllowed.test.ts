import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addGoalGrade,
  fetchGoalGrades,
  fetchGoalTimer,
  fetchGoalWorkbooks,
} from "./goalApi";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./apiFetch", () => ({
  apiFetch: apiFetchMock,
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
}));

beforeEach(() => apiFetchMock.mockReset());

function respond(status: number, body: object) {
  apiFetchMock.mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
}

describe("goalApi 이용 거부 사유", () => {
  it("조회형 200 {allowed:false} 의 기관 거부 사유를 싣는다", async () => {
    respond(200, { allowed: false, tenantReason: "month_cap" });
    expect(await fetchGoalGrades()).toEqual({
      kind: "not-allowed",
      tenantReason: "month_cap",
    });
  });

  it("쓰기형 403 의 기관 거부 사유를 싣는다", async () => {
    respond(403, { detail: "x", tenantReason: "disabled" });
    expect(
      await addGoalGrade("naesin", { term: "1-1", subjects: {} } as never),
    ).toEqual({ kind: "not-allowed", tenantReason: "disabled" });
  });

  it("본문을 읽기 전에 403 을 처리하는 호출도 사유를 싣는다", async () => {
    respond(403, { tenantReason: "term_cap" });
    expect(await fetchGoalWorkbooks()).toEqual({
      kind: "not-allowed",
      tenantReason: "term_cap",
    });
  });

  it("타이머의 거부 사유도 싣는다", async () => {
    respond(200, { allowed: false, tenantReason: "grace" });
    expect(await fetchGoalTimer()).toEqual({
      kind: "not-allowed",
      tenantReason: "grace",
    });
  });

  it("위닝 거부는 사유가 null 이다", async () => {
    respond(403, { detail: "x" });
    expect(
      await addGoalGrade("naesin", { term: "1-1", subjects: {} } as never),
    ).toEqual({ kind: "not-allowed", tenantReason: null });
  });
});
