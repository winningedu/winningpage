// 특이학생 감지 규칙(W6, 사 #147, 결정 106 6번). 기준값은 기관 열이 null 이면 기본값을 쓴다.
// 입력을 다 받아 사유 목록만 정하는 순수 함수라 읽기와 쓰기는 여기에 없다.

export const SPECIAL_DEFAULTS = {
  execRatePct: 40,
  inactiveDays: 7,
  feedbackWaitDays: 14,
} as const;

export interface SpecialThresholds {
  execRatePct: number;
  inactiveDays: number;
  feedbackWaitDays: number;
}

export type SpecialReason =
  | "low_rate"
  | "inactive"
  | "urgency"
  | "feedback_wait"
  | "manual";

export interface SpecialInput {
  /** 이번 주 달성율(%). 목표를 쓰지 않으면 null. */
  weeklyRate: number | null;
  urgency: string | null;
  /** 마지막 접속일과 오늘의 KST 달력 날짜 차이. 기록이 없으면 null(미접속으로 잡지 않는다). */
  lastSeenDays: number | null;
  /** 가장 최근 제출이 평가를 기다리는 날수(KST 달력). 기다리는 제출이 없으면 null. */
  feedbackWaitingDays: number | null;
  flagged: boolean;
}

interface TenantThresholdRow {
  special_exec_rate_pct: number | null;
  special_inactive_days: number | null;
  special_feedback_wait_days: number | null;
}

export function resolveThresholds(
  row: Partial<TenantThresholdRow> | null | undefined,
): SpecialThresholds {
  return {
    execRatePct: row?.special_exec_rate_pct ?? SPECIAL_DEFAULTS.execRatePct,
    inactiveDays: row?.special_inactive_days ?? SPECIAL_DEFAULTS.inactiveDays,
    feedbackWaitDays:
      row?.special_feedback_wait_days ?? SPECIAL_DEFAULTS.feedbackWaitDays,
  };
}

/** 응답 순서는 low_rate, inactive, urgency, feedback_wait, manual 이다. */
export function specialReasonsOf(
  input: SpecialInput,
  t: SpecialThresholds,
): SpecialReason[] {
  const reasons: SpecialReason[] = [];
  if (input.weeklyRate !== null && input.weeklyRate < t.execRatePct)
    reasons.push("low_rate");
  return reasons;
}
