import { describe, expect, it } from "vitest";
import { buildGrowthPdfFileName } from "./pdfFileName";

describe("buildGrowthPdfFileName", () => {
  it("대주제를 이어 붙인다", () => {
    expect(buildGrowthPdfFileName("의료 AI 설계자")).toBe(
      "성장설계_리포트_의료 AI 설계자",
    );
  });
});
