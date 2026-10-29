import { describe, expect, it } from "vitest";
import { ALLOWED_MIME_EXT, UNSUPPORTED_MIME_MESSAGE } from "./upload-url.js";

describe("안내문 업로드 MIME 화이트리스트", () => {
  it("application/pdf를 pdf 확장자로 허용한다", () => {
    expect(ALLOWED_MIME_EXT["application/pdf"]).toBe("pdf");
  });

  it("기존 이미지 형식은 그대로 허용한다", () => {
    expect(Object.keys(ALLOWED_MIME_EXT).sort()).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("HEIC와 임의 형식은 허용하지 않는다", () => {
    expect(ALLOWED_MIME_EXT["image/heic"]).toBeUndefined();
    expect(ALLOWED_MIME_EXT["application/zip"]).toBeUndefined();
  });

  it("거부 문구가 PDF 허용을 안내한다", () => {
    expect(UNSUPPORTED_MIME_MESSAGE).toContain("PDF");
  });
});
