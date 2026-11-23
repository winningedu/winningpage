// Fixed layout labels of the v3 report. 22_리포트요소 lists content only, so
// these come from the improved report PDF layout (page chrome, card titles);
// no sheet cell holds them. Content strings always come from the payload.

/**
 * Footer total. judge-report R9: numbering stays fixed at 16 even when M3
 * drops page 7 (명세 123행: cover + 16 pages).
 */
export const TOTAL_PAGES = 16;

export const REPORT_LABELS = {
  reportName: "학습진단 리포트",
  studentOnly: "학생 전용",
} as const;
