// 업로드 미리보기 계약: 서버가 검증하는 요청 스키마와 브라우저가 검증하는 응답 스키마.

import { describe, expect, test } from "vitest";
import { uploadPreviewBody, uploadPreviewSchema } from "./preview.js";

describe("uploadPreviewBody", () => {
  test("section 과 path 가 문자열이어야 한다", () => {
    expect(
      uploadPreviewBody.safeParse({ section: "a", path: "b" }).success,
    ).toBe(true);
    expect(uploadPreviewBody.safeParse({ section: "a" }).success).toBe(false);
  });
});

describe("uploadPreviewSchema", () => {
  test("미리보기는 url 을 준다", () => {
    expect(uploadPreviewSchema.parse({ url: "https://x" })).toEqual({
      url: "https://x",
    });
    expect(uploadPreviewSchema.safeParse({}).success).toBe(false);
  });
});
