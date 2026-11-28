import { afterEach, describe, expect, test, vi } from "vitest";
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

describe("prepareGuideImage 읽기", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("JPEG 방향 읽기가 끝나지 않아도 디코딩을 함께 시작한다", async () => {
    const file = new File(["jpeg"], "a.jpg", { type: "image/jpeg" });
    let release: (value: ArrayBuffer) => void = () => {};
    const head = new Promise<ArrayBuffer>((resolve) => {
      release = resolve;
    });
    Object.defineProperty(file, "slice", {
      value: () => ({ arrayBuffer: () => head }),
    });
    const bitmap = { width: 100, height: 50, close: vi.fn() };
    const createImageBitmapMock = vi.fn(async () => bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);

    const run = prepareGuideImage(file);
    await Promise.resolve();
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    release(new ArrayBuffer(0));

    await expect(run).resolves.toBe(file);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
