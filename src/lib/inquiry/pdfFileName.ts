// 심화탐구 PDF 파일명: `심화탐구_{설계리포트|보고서}_{주제 제목}`.
// 파일 시스템에서 쓸 수 없는 문자는 공백으로 바꾸고, 제목이 없으면 그 조각을 뺀다.
const UNSAFE_CHARS = /[\\/:*?"<>|]/g;

export function buildInquiryPdfFileName(
  kind: "design" | "report",
  title: string | null | undefined,
): string {
  const base = kind === "design" ? "심화탐구_설계리포트" : "심화탐구_보고서";
  const safeTitle = (title ?? "").replace(UNSAFE_CHARS, " ").trim();
  return safeTitle ? `${base}_${safeTitle}` : base;
}
