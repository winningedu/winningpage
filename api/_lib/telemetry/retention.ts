// AI 호출 기록 보존 기간. 이 기간이 지난 행은 정리 크론이 지운다.
export const AI_TELEMETRY_RETENTION_DAYS = 365;

// now 에서 days 일 전 시각을 ISO 문자열로 돌려준다.
export function retentionCutoffIso(
  now: Date,
  days: number = AI_TELEMETRY_RETENTION_DAYS,
): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
