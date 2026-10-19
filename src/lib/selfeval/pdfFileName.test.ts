import { describe, expect, it } from "vitest";
import { buildSelfevalPdfFileName } from "./pdfFileName";

describe("buildSelfevalPdfFileName", () => {
  it("자기평가서 뒤에 제목을 이어 붙인다", () => {
    expect(buildSelfevalPdfFileName("수학 자기평가서")).toBe(
      "자기평가서_수학 자기평가서",
    );
  });

  it("파일명에 쓸 수 없는 문자는 공백으로 바꾼다", () => {
    expect(buildSelfevalPdfFileName("A/B: 비교")).toBe("자기평가서_A B  비교");
  });

  it("제목이 비면 제목 조각을 뺀다", () => {
    expect(buildSelfevalPdfFileName("  ")).toBe("자기평가서");
  });
});
