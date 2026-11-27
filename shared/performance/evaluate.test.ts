import { describe, expect, test } from "vitest";
import { evaluateBody, evaluateResponse } from "./evaluate.js";

const ID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";

describe("evaluateBody", () => {
  test("두 id 는 uuid 이고 regenerate 는 생략하거나 불리언이다", () => {
    const parse = (over: Record<string, unknown>) =>
      evaluateBody.safeParse({ sessionId: ID, submissionId: ID, ...over })
        .success;
    expect(parse({})).toBe(true);
    expect(parse({ regenerate: true })).toBe(true);
    expect(parse({ regenerate: "yes" })).toBe(false);
    expect(parse({ sessionId: "x" })).toBe(false);
    expect(parse({ submissionId: undefined })).toBe(false);
  });
});

describe("evaluateResponse", () => {
  const base = {
    report: {
      id: "r1",
      sections: [],
      score: 80,
      summary: "요약",
      structure: null,
    },
    submissionId: ID,
    submissionRevision: 1,
    quotaRemaining: null,
    charged: false,
    evaluationCount: 1,
    maxEvaluations: 2,
  };

  test("새 응답과 재생 응답이 모두 통과한다", () => {
    expect(evaluateResponse.safeParse(base).success).toBe(true);
    expect(
      evaluateResponse.safeParse({ ...base, reused: true, charCounts: {} })
        .success,
    ).toBe(true);
  });

  test("charged 가 true 이거나 회차 필드가 없으면 거절한다", () => {
    expect(evaluateResponse.safeParse({ ...base, charged: true }).success).toBe(
      false,
    );
    expect(
      evaluateResponse.safeParse({ ...base, evaluationCount: undefined })
        .success,
    ).toBe(false);
  });
});
