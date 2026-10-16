// 지식 DB 자료 관리 주기(last_reviewed_at)의 판단 순수 함수.

import { formatValue } from "@/pages/admin/shared/csvExport";

/** 미검토 기준 개월 수 선택지. */
export const REVIEW_STALE_MONTH_OPTIONS = [3, 6, 12] as const;

export type ReviewStaleMonths = (typeof REVIEW_STALE_MONTH_OPTIONS)[number];

/** 미검토 기준 개월 수 기본값. */
export const DEFAULT_REVIEW_STALE_MONTHS: ReviewStaleMonths = 6;

/**
 * 검토 기록이 없거나 now 기준 months 개월 전보다 오래됐으면 미검토다.
 * 읽을 수 없는 날짜는 검토 기록이 없는 것으로 본다.
 */
export function isStaleReview(
  lastReviewedAt: string | null | undefined,
  now: Date,
  months: number,
): boolean {
  if (!lastReviewedAt) return true;
  const reviewed = new Date(lastReviewedAt);
  if (Number.isNaN(reviewed.getTime())) return true;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return reviewed.getTime() < cutoff.getTime();
}

/** 목록 "마지막 검토" 셀 문구. 날짜는 다른 날짜 컬럼과 같은 형식으로 보인다. */
export function formatLastReviewed(value: string | null | undefined): string {
  if (!value) return "검토 기록 없음";
  return formatValue(value, "date");
}
