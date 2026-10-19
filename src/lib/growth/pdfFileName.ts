// 성장설계 PDF 파일명: `성장설계_리포트_{대주제}`.
// 파일 시스템에서 쓸 수 없는 문자는 공백으로 바꾸고, 대주제가 없으면 그 조각을 뺀다.
const UNSAFE_CHARS = /[\\/:*?"<>|]/g;
const BASE = "성장설계_리포트";

export function buildGrowthPdfFileName(
  theme: string | null | undefined,
): string {
  const safeTheme = (theme ?? "").replace(UNSAFE_CHARS, " ").trim();
  return safeTheme ? `${BASE}_${safeTheme}` : BASE;
}
