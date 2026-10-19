import { describe, expect, it } from "vitest";
import { buildSelfevalPdfFileName } from "./pdfFileName";

describe("buildSelfevalPdfFileName", () => {
  it("자기평가서 뒤에 제목을 이어 붙인다", () => {
    expect(buildSelfevalPdfFileName("확통")).toBe("자기평가서_확통");
  });
});
