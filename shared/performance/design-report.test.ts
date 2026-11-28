import { describe, expect, test } from "vitest";
import { designReportBody, designReportResponse } from "./design-report.js";

const ID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";

describe("designReportBody", () => {
  const ok = (over: Record<string, unknown>) =>
    designReportBody.safeParse({ sessionId: ID, topicId: ID, ...over }).success;

  test("두 id 는 uuid 이고 regenerate 는 생략하거나 불리언이다", () => {
    expect(ok({})).toBe(true);
    expect(ok({ regenerate: true })).toBe(true);
    expect(ok({ regenerate: 1 })).toBe(false);
    expect(ok({ sessionId: "x" })).toBe(false);
    expect(ok({ topicId: undefined })).toBe(false);
  });
});

describe("designReportResponse", () => {
  const base = {
    reportId: "r1",
    topicId: ID,
    structure: null,
    sections: [],
    resources: [],
    quotaRemaining: null,
    charged: false,
    generationCount: 1,
    maxGenerations: 3,
    promptVersion: "v1",
    model: "m",
  };

  test("새 응답과 재생 응답이 통과한다", () => {
    expect(designReportResponse.safeParse(base).success).toBe(true);
    expect(
      designReportResponse.safeParse({ ...base, reused: true }).success,
    ).toBe(true);
  });

  test("charged 가 true 이거나 회차 필드가 없으면 거절한다", () => {
    expect(
      designReportResponse.safeParse({ ...base, charged: true }).success,
    ).toBe(false);
    expect(
      designReportResponse.safeParse({ ...base, generationCount: undefined })
        .success,
    ).toBe(false);
  });
});
