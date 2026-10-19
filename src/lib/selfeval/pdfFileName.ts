// 자기평가서 PDF 파일명: `자기평가서_{제목}`.
import { buildReportPdfFileName } from "@/lib/report/pdfFileName";

const BASE = "자기평가서";

export function buildSelfevalPdfFileName(title: string): string {
  return buildReportPdfFileName(BASE, title);
}
