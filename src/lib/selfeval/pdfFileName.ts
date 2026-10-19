// 자기평가서 PDF 파일명: `자기평가서_{제목}`.
// 파일 시스템에서 쓸 수 없는 문자는 공백으로 바꾸고, 제목이 비면 그 조각을 뺀다.
const UNSAFE_CHARS = /[\\/:*?"<>|]/g;
const BASE = "자기평가서";

export function buildSelfevalPdfFileName(title: string): string {
  const safeTitle = title.replace(UNSAFE_CHARS, " ").trim();
  return safeTitle ? `${BASE}_${safeTitle}` : BASE;
}
