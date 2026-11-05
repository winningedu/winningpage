// 대시보드 숫자와 날짜 표기.

/** 정수 퍼센트. 분모가 0이면 0(이용 학생이 없는 범위). */
export function percent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

/** "2026-11-02" 를 "2026.11.02" 로. */
export function dotDate(ymd: string): string {
  return ymd.replaceAll("-", ".");
}
