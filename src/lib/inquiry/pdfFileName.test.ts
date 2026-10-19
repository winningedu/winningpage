import { describe, expect, it } from "vitest";
import { buildInquiryPdfFileName } from "./pdfFileName";

describe("buildInquiryPdfFileName", () => {
  it("종류별 기본 이름 뒤에 주제 제목을 이어 붙인다", () => {
    expect(buildInquiryPdfFileName("design", "효소 활성 탐구")).toBe(
      "심화탐구_설계리포트_효소 활성 탐구",
    );
    expect(buildInquiryPdfFileName("report", "효소 활성 탐구")).toBe(
      "심화탐구_보고서_효소 활성 탐구",
    );
  });
});
