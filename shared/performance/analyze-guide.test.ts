import { describe, expect, test } from "vitest";
import { analyzeGuideBody, analyzeGuideResponse } from "./analyze-guide.js";

const ID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";

describe("analyzeGuideBody", () => {
  const ok = (body: Record<string, unknown>) =>
    analyzeGuideBody.safeParse({ sessionId: ID, ...body }).success;

  test("첨부 id 나 직접 입력 중 하나는 있어야 한다", () => {
    expect(ok({ attachmentIds: [ID] })).toBe(true);
    expect(ok({ freetext: "내용" })).toBe(true);
    expect(ok({})).toBe(false);
    expect(ok({ freetext: "   " })).toBe(false);
  });

  test("첨부 id 는 uuid 1개 이상 5개 이하다", () => {
    expect(ok({ attachmentIds: [] })).toBe(false);
    expect(ok({ attachmentIds: ["x"] })).toBe(false);
    expect(ok({ attachmentIds: Array(6).fill(ID) })).toBe(false);
  });

  test("force 는 불리언이고 sessionId 는 uuid 다", () => {
    expect(ok({ attachmentIds: [ID], force: "yes" })).toBe(false);
    expect(
      analyzeGuideBody.safeParse({ sessionId: "x", freetext: "a" }).success,
    ).toBe(false);
  });
});

describe("analyzeGuideResponse", () => {
  test("직접 입력 응답과 업로드 응답이 통과한다", () => {
    expect(
      analyzeGuideResponse.safeParse({
        guide: { mode: "manual", text: "a" },
        attachments: [],
        promptVersion: null,
        model: null,
        charged: false,
      }).success,
    ).toBe(true);
    expect(
      analyzeGuideResponse.safeParse({
        guide: { mode: "upload" },
        attachments: [{ attachmentId: "a", deleted: false }],
        promptVersion: "v1",
        model: "m",
        charged: false,
        reused: false,
      }).success,
    ).toBe(true);
  });
});
