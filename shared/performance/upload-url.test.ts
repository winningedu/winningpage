import { describe, expect, test } from "vitest";
import { uploadUrlBody, uploadUrlResponse } from "./upload-url.js";

const SID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";

describe("uploadUrlBody", () => {
  test("mimeType 은 앞뒤 공백을 자르고 소문자로 맞춘다", () => {
    expect(
      uploadUrlBody.parse({
        sessionId: SID,
        mimeType: " Image/PNG ",
        byteSize: 5,
      }),
    ).toEqual({ sessionId: SID, mimeType: "image/png", byteSize: 5 });
  });

  test("sessionId 가 uuid 가 아니거나 byteSize 가 양의 정수가 아니면 거절한다", () => {
    const parse = (over: Record<string, unknown>) =>
      uploadUrlBody.safeParse({
        sessionId: SID,
        mimeType: "image/png",
        byteSize: 5,
        ...over,
      }).success;
    expect(parse({})).toBe(true);
    expect(parse({ sessionId: "x" })).toBe(false);
    expect(parse({ byteSize: 0 })).toBe(false);
    expect(parse({ byteSize: "5" })).toBe(false);
  });
});

describe("uploadUrlResponse", () => {
  test("발급 필드가 모두 있어야 한다", () => {
    const ok = {
      attachmentId: "a",
      bucket: "b",
      path: "p",
      token: "t",
      signedUrl: "u",
      expiresAt: "2026-11-27T00:00:00.000Z",
    };
    expect(uploadUrlResponse.safeParse(ok).success).toBe(true);
    expect(
      uploadUrlResponse.safeParse({ ...ok, token: undefined }).success,
    ).toBe(false);
  });
});
