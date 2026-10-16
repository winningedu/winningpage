// 제출 뒤 본문 "전체 복사" 공용 동작. 자기평가, 심화탐구, 수행평가가 같은 문구와 동작을 쓴다.

export type CopyToast = {
  success: (message: string) => unknown;
  error: (message: string) => unknown;
};

const COPIED = "복사했어요";
const COPY_FAILED = "복사하지 못했어요. 직접 선택해서 복사해 주세요.";

/** 글을 클립보드에 넣고 토스트로 알린다. 성공 여부를 돌려준다. */
export async function copyTextWithToast(
  text: string,
  toast: CopyToast,
): Promise<boolean> {
  if (text.trim() === "") {
    toast.error(COPY_FAILED);
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(COPIED);
    return true;
  } catch {
    toast.error(COPY_FAILED);
    return false;
  }
}

/** 화면 요소의 보이는 글. jsdom 처럼 innerText 가 없는 환경에서는 textContent 로 읽는다. */
export function elementPlainText(el: HTMLElement | null): string {
  if (!el) return "";
  return el.innerText ?? el.textContent ?? "";
}
