// coupons.valid_until(date, 예: '2026-09-30')을 "~9월 30일까지" 형태로. 달력 날짜라
// 문자열을 쪼개 쓰고 Date 로 파싱하지 않는다(브라우저 시간대에 따라 하루가 밀리지
// 않는다). 값이 없거나 날짜 형식이 아니면 기한을 아예 표기하지 않는다.
export function formatCouponDeadline(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return `~${month}월 ${day}일까지`;
}
