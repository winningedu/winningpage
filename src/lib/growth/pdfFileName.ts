// 성장설계 PDF 파일명: `성장설계_리포트_{대주제}`.
import { buildReportPdfFileName } from "@/lib/report/pdfFileName";

const BASE = "성장설계_리포트";

export function buildGrowthPdfFileName(
  theme: string | null | undefined,
): string {
  return buildReportPdfFileName(BASE, theme);
}
