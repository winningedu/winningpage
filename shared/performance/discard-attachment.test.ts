import { describe, expect, test } from "vitest";
import {
  discardAttachmentBody,
  discardAttachmentResponse,
} from "./discard-attachment.js";

const ID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";

describe("discardAttachmentBody", () => {
  test("두 id 가 모두 uuid 형식이어야 한다", () => {
    const parse = (over: Record<string, unknown>) =>
      discardAttachmentBody.safeParse({
        sessionId: ID,
        attachmentId: ID,
        ...over,
      }).success;
    expect(parse({})).toBe(true);
    expect(parse({ sessionId: "x" })).toBe(false);
    expect(parse({ attachmentId: undefined })).toBe(false);
  });
});

describe("discardAttachmentResponse", () => {
  test("discarded 는 true 여야 한다", () => {
    expect(
      discardAttachmentResponse.safeParse({ discarded: true, attachmentId: ID })
        .success,
    ).toBe(true);
    expect(
      discardAttachmentResponse.safeParse({
        discarded: false,
        attachmentId: ID,
      }).success,
    ).toBe(false);
  });
});
