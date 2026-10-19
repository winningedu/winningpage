// 심화탐구 PDF 파일명: `심화탐구_{설계리포트|보고서}_{주제 제목}`.
import { buildReportPdfFileName } from "@/lib/report/pdfFileName";

export function buildInquiryPdfFileName(
  kind: "design" | "report",
  title: string | null | undefined,
): string {
  const base = kind === "design" ? "심화탐구_설계리포트" : "심화탐구_보고서";
  return buildReportPdfFileName(base, title);
}
