import { describe, expect, test } from "vitest";
import {
  IMAGE_ACCEPT_ATTR,
  isAllowedImageFile,
  isPdfFile,
  prepareGuideImage,
} from "./guideImage";

const pdf = () =>
  new File(["%PDF-1.4"], "guide.pdf", { type: "application/pdf" });

describe("안내문 PDF 허용", () => {
  test("accept 속성에 application/pdf가 들어 있다", () => {
    expect(IMAGE_ACCEPT_ATTR.split(",")).toContain("application/pdf");
  });

  test("PDF는 허용 파일이고 PDF 판별이 참이다", () => {
    expect(isAllowedImageFile(pdf())).toBe(true);
    expect(isPdfFile(pdf())).toBe(true);
  });

  test("HEIC 같은 기타 형식은 여전히 허용되지 않는다", () => {
    const heic = new File(["x"], "a.heic", { type: "image/heic" });
    expect(isAllowedImageFile(heic)).toBe(false);
    expect(isPdfFile(heic)).toBe(false);
  });

  test("prepareGuideImage는 PDF를 리사이즈 없이 원본 그대로 돌려준다", async () => {
    const file = pdf();
    await expect(prepareGuideImage(file)).resolves.toBe(file);
  });
});
