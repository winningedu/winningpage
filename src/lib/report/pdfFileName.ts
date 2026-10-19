// 리포트 PDF 파일명 공통 규칙: `{기본 이름}_{제목}`.
// 파일 시스템에서 쓸 수 없는 문자는 공백으로 바꾸고, 제목이 비면 그 조각을 뺀다.
const UNSAFE_CHARS = /[\\/:*?"<>|]/g;

export function buildReportPdfFileName(
  base: string,
  title: string | null | undefined,
): string {
  const safeTitle = (title ?? "").replace(UNSAFE_CHARS, " ").trim();
  return safeTitle ? `${base}_${safeTitle}` : base;
}
