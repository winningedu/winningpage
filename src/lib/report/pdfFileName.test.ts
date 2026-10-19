import { describe, expect, it } from "vitest";
import { buildReportPdfFileName } from "./pdfFileName";

describe("buildReportPdfFileName", () => {
  it("기본 이름 뒤에 제목을 이어 붙인다", () => {
    expect(buildReportPdfFileName("리포트", "확통")).toBe("리포트_확통");
  });

  it("파일명에 쓸 수 없는 문자는 공백으로 바꾼다", () => {
    expect(buildReportPdfFileName("리포트", 'A/B: 비교*?"<>|\\')).toBe(
      "리포트_A B  비교",
    );
  });

  it("제목이 없거나 비면 기본 이름만 쓴다", () => {
    expect(buildReportPdfFileName("리포트", undefined)).toBe("리포트");
    expect(buildReportPdfFileName("리포트", null)).toBe("리포트");
    expect(buildReportPdfFileName("리포트", "  ")).toBe("리포트");
  });
});
