import { describe, expect, it } from "vitest";
import { buildGrowthPdfFileName } from "./pdfFileName";

describe("buildGrowthPdfFileName", () => {
  it("대주제를 이어 붙인다", () => {
    expect(buildGrowthPdfFileName("의료 AI 설계자")).toBe(
      "성장설계_리포트_의료 AI 설계자",
    );
  });

  it("파일명에 쓸 수 없는 문자는 공백으로 바꾼다", () => {
    expect(buildGrowthPdfFileName("A/B: 비교")).toBe(
      "성장설계_리포트_A B  비교",
    );
  });

  it("대주제가 없으면 제목 조각을 뺀다", () => {
    expect(buildGrowthPdfFileName(undefined)).toBe("성장설계_리포트");
    expect(buildGrowthPdfFileName("  ")).toBe("성장설계_리포트");
  });
});
