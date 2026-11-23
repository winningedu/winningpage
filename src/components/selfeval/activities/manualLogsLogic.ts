import { SELFEVAL_NOTICE_LINES } from "@/components/selfeval/SelfevalNotice";
import type { ManualMemo } from "@/lib/selfeval/api";

// 수기 수행보고 카드의 순수 로직(명세 No.158~161, 90, 91). 서버 규칙과 숫자를 맞춘다.

export const MEMO_MAX_CHARS = 300;
/** 서버가 받는 원본 최대 바이트. base64 로 부풀어도 Vercel 본문 한도 안에 든다. */
export const FILE_MAX_BYTES = 3 * 1024 * 1024;
export const PASTE_MAX_CHARS = 6000;

const FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

/** 하단 고지의 생활기록부 줄을 그대로 쓴다(명세 No.91). */
export const RECORD_BOOK_NOTICE = SELFEVAL_NOTICE_LINES.find((line) =>
  line.startsWith("생활기록부 원문"),
);

export const NAME_NOTICE =
  "사람 이름이나 학교 이름이 보여요. 지우거나 다른 말로 바꾼 뒤에 확인해 주세요.";

/** 올리기 전에 브라우저에서 한 번 거른다. 통과하면 null, 아니면 학생에게 보일 안내. */
export function checkUploadFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!FILE_TYPES.includes(file.type)) {
    return "사진(JPG, PNG, WEBP, HEIC)이나 PDF 파일만 올릴 수 있어요.";
  }
  if (file.size > FILE_MAX_BYTES) return "파일은 3MB까지 올릴 수 있어요.";
  return null;
}

/** File 을 base64 문자열로 바꾼다(data URL 접두사 없음). */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export type MemoDraft = { writtenAt: string; text: string };

export function draftOf(memo: ManualMemo): MemoDraft {
  return { writtenAt: memo.writtenAt ?? "", text: memo.text };
}

export function isDirty(memo: ManualMemo, draft: MemoDraft): boolean {
  const base = draftOf(memo);
  return base.writtenAt !== draft.writtenAt || base.text !== draft.text;
}

/** 확인 버튼을 누를 수 있는지. 학년도 판정은 서버가 하고 그 안내를 화면에 보인다. */
export function canConfirm(draft: MemoDraft): boolean {
  return (
    draft.writtenAt !== "" &&
    draft.text.trim() !== "" &&
    draft.text.length <= MEMO_MAX_CHARS
  );
}
