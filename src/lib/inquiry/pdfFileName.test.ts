import { describe, expect, it } from "vitest";
import { buildInquiryPdfFileName } from "./pdfFileName";

describe("buildInquiryPdfFileName", () => {
  it("종류와 주제 제목을 이어 붙인다", () => {
    expect(buildInquiryPdfFileName("design", "효소 활성 탐구")).toBe(
      "심화탐구_설계리포트_효소 활성 탐구",
    );
    expect(buildInquiryPdfFileName("report", "효소 활성 탐구")).toBe(
      "심화탐구_보고서_효소 활성 탐구",
    );
  });

  it("파일명에 쓸 수 없는 문자는 공백으로 바꾼다", () => {
    expect(buildInquiryPdfFileName("design", "A/B: 비교")).toBe(
      "심화탐구_설계리포트_A B  비교",
    );
  });

  it("제목이 없으면 제목 조각을 뺀다", () => {
    expect(buildInquiryPdfFileName("report", undefined)).toBe(
      "심화탐구_보고서",
    );
  });
});
