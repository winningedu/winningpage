// goalFail: 목표관리 라우트의 예전 실패 본문을 problem 으로 바꾸는 규칙.
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { goalFail } from "./problem.js";
import { PAID_MESSAGE } from "./repo.js";

async function fail(status: number, body: Record<string, unknown>) {
  const app = new Hono().get("/", (c) => goalFail(c, status, body));
  const response = await app.request("/");
  return {
    status: response.status,
    type: response.headers.get("content-type"),
    body: await response.json(),
  };
}

describe("goalFail", () => {
  it("detail 은 problem detail, 상태별 공통 code 다", async () => {
    expect(await fail(400, { detail: "유효하지 않은 과목입니다." })).toEqual({
      status: 400,
      type: "application/problem+json",
      body: expect.objectContaining({
        detail: "유효하지 않은 과목입니다.",
        code: "VALIDATION_FAILED",
      }),
    });
  });

  it("reason 은 대문자 code 이고 확장 멤버로도 남는다. 다른 키도 그대로다", async () => {
    const { body } = await fail(409, {
      reason: "cooldown",
      submittedAt: "2026-11-27T01:00:00Z",
    });
    expect(body).toMatchObject({
      code: "COOLDOWN",
      reason: "cooldown",
      submittedAt: "2026-11-27T01:00:00Z",
    });
  });

  it("reason 만 있으면 서버 문구를 채운다", async () => {
    const { body } = await fail(400, { reason: "no_study_time" });
    expect(body.detail).toBe("공부 시간을 입력해 주세요.");
  });

  it("미결제 403 은 NO_ENTITLEMENT 이고 tenantReason 을 싣는다", async () => {
    const { body } = await fail(403, {
      detail: PAID_MESSAGE,
      tenantReason: "catch_all",
    });
    expect(body).toMatchObject({
      code: "NO_ENTITLEMENT",
      detail: PAID_MESSAGE,
      tenantReason: "catch_all",
    });
  });
});
