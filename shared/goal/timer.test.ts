// 열공 타이머 계약: 요청 본문 검사와 응답 모양.

import { describe, expect, test } from "vitest";
import { timerBody, timerGetResponse } from "./timer.js";

describe("timerBody", () => {
  test("action 별로 필요한 필드만 받는다", () => {
    expect(timerBody.safeParse({ action: "stop" }).success).toBe(true);
    expect(
      timerBody.safeParse({ action: "start", subject: "math" }).success,
    ).toBe(true);
    expect(timerBody.safeParse({ action: "start" }).success).toBe(false);
  });

  test("목표 시간은 0 이상 24 이하 숫자다", () => {
    const body = (targetHours: unknown) =>
      timerBody.safeParse({ action: "setTarget", subject: "math", targetHours })
        .success;
    expect(body(0)).toBe(true);
    expect(body(24)).toBe(true);
    expect(body(-1)).toBe(false);
    expect(body(24.5)).toBe(false);
  });
});

describe("timerGetResponse", () => {
  test("이용권 없음 본문도 받는다", () => {
    expect(
      timerGetResponse.parse({ allowed: false, tenantReason: "month_cap" }),
    ).toEqual({ allowed: false, tenantReason: "month_cap" });
  });
});
