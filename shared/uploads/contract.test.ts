// 업로드 계약: 서버가 검증하는 요청 스키마와 브라우저가 검증하는 응답 스키마.

import { describe, expect, test } from "vitest";
import {
  issuedUploadSchema,
  UPLOAD_FILE_NAME_MAX_LENGTH,
  UPLOAD_REMOVE_MAX_PATHS,
  uploadIssueBody,
  uploadPreviewBody,
  uploadPreviewSchema,
  uploadRemoveBody,
} from "./contract.js";

const ISSUE = {
  section: "banners",
  field: "image_url",
  fileName: "a.png",
  contentType: "image/png",
  size: 1,
};

describe("uploadIssueBody", () => {
  test("정상 본문을 받는다", () => {
    expect(uploadIssueBody.parse(ISSUE)).toEqual(ISSUE);
  });

  test.each([
    ["빈 field", { field: "" }],
    ["빈 파일 이름", { fileName: "" }],
    [
      "255자를 넘는 파일 이름",
      { fileName: "a".repeat(UPLOAD_FILE_NAME_MAX_LENGTH + 1) },
    ],
    ["빈 contentType", { contentType: "" }],
    ["0 byte", { size: 0 }],
    ["정수가 아닌 size", { size: 1.5 }],
    ["문자열이 아닌 section", { section: 1 }],
  ])("%s 는 거부한다", (_name, override) => {
    expect(uploadIssueBody.safeParse({ ...ISSUE, ...override }).success).toBe(
      false,
    );
  });
});

describe("uploadRemoveBody", () => {
  test("경로는 1개 이상 100개 이하다", () => {
    const body = (count: number) => ({
      section: "banners",
      paths: Array.from({ length: count }, (_, i) => `f/${i}.png`),
    });
    expect(uploadRemoveBody.safeParse(body(1)).success).toBe(true);
    expect(
      uploadRemoveBody.safeParse(body(UPLOAD_REMOVE_MAX_PATHS)).success,
    ).toBe(true);
    expect(uploadRemoveBody.safeParse(body(0)).success).toBe(false);
    expect(
      uploadRemoveBody.safeParse(body(UPLOAD_REMOVE_MAX_PATHS + 1)).success,
    ).toBe(false);
  });
});

describe("uploadPreviewBody", () => {
  test("section 과 path 가 문자열이어야 한다", () => {
    expect(
      uploadPreviewBody.safeParse({ section: "a", path: "b" }).success,
    ).toBe(true);
    expect(uploadPreviewBody.safeParse({ section: "a" }).success).toBe(false);
  });
});

describe("응답 스키마", () => {
  test("발급은 path 와 uploadUrl, 미리보기는 url 을 준다", () => {
    expect(
      issuedUploadSchema.parse({ path: "p", uploadUrl: "https://x" }),
    ).toEqual({ path: "p", uploadUrl: "https://x" });
    expect(issuedUploadSchema.safeParse({ path: "p" }).success).toBe(false);
    expect(uploadPreviewSchema.parse({ url: "https://x" })).toEqual({
      url: "https://x",
    });
  });
});
