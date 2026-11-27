import { describe, expect, test } from "vitest";
import { verifyBody, verifyResponse } from "./verify.js";

const SID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";

describe("verifyBody", () => {
  test("sessionId 가 uuid 형식이면 받는다", () => {
    expect(verifyBody.parse({ sessionId: SID })).toEqual({ sessionId: SID });
  });

  test("sessionId 형식이 틀리거나 본문이 객체가 아니면 거절한다", () => {
    expect(verifyBody.safeParse({ sessionId: "x" }).success).toBe(false);
    expect(verifyBody.safeParse({}).success).toBe(false);
    expect(verifyBody.safeParse(null).success).toBe(false);
  });
});

describe("verifyResponse", () => {
  const verification = {
    id: "r1",
    revision: 2,
    sections: { total: 80, submittable: true, items: [] },
    score: 80,
    mandatoryFixes: [],
  };

  test("ok 필드 없이 검증 리포트, 차감 여부, 단계, 시도 수를 읽는다", () => {
    const parsed = verifyResponse.parse({
      verification,
      charged: true,
      currentStep: 5,
      attempts: 1,
      softIssues: [],
    });
    expect(parsed.verification.score).toBe(80);
    expect(parsed.charged).toBe(true);
  });

  test("점수가 없으면 거절한다", () => {
    expect(
      verifyResponse.safeParse({
        verification: { ...verification, score: null },
        charged: true,
        currentStep: 5,
        attempts: 1,
        softIssues: [],
      }).success,
    ).toBe(false);
  });
});
