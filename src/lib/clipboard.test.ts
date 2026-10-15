import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextWithToast, elementPlainText } from "./clipboard";

function makeToast() {
  return { success: vi.fn(), error: vi.fn() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("copyTextWithToast", () => {
  it("글을 클립보드에 넣고 성공 토스트를 띄운다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const toast = makeToast();

    const ok = await copyTextWithToast("본문", toast);

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("본문");
    expect(toast.success).toHaveBeenCalledWith("복사했어요");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("글이 비어 있으면 복사하지 않고 실패 토스트를 띄운다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const toast = makeToast();

    const ok = await copyTextWithToast("  \n ", toast);

    expect(ok).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "복사하지 못했어요. 직접 선택해서 복사해 주세요.",
    );
  });

  it("클립보드 쓰기가 실패하면 실패 토스트를 띄운다", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const toast = makeToast();

    const ok = await copyTextWithToast("본문", toast);

    expect(ok).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

describe("elementPlainText", () => {
  it("innerText 가 없는 환경에서는 textContent 로 읽는다", () => {
    const el = document.createElement("div");
    el.textContent = "표면 글";
    expect(elementPlainText(el)).toBe("표면 글");
  });

  it("innerText 가 있으면 줄바꿈이 살아 있는 그 값을 쓴다", () => {
    const el = document.createElement("div");
    el.textContent = "a b";
    Object.defineProperty(el, "innerText", { value: "a\nb" });
    expect(elementPlainText(el)).toBe("a\nb");
  });

  it("요소가 없으면 빈 글을 돌려준다", () => {
    expect(elementPlainText(null)).toBe("");
  });
});
