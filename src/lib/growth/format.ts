// 성장설계 화면 공용 날짜 포맷. 서버 시각은 ISO 문자열이고 화면은 회원 시간대 날짜로 보여 준다.

import { browserTimeZone } from "@/lib/time/zone";

/**
 * `2026년 11월 14일`. timeZone 은 회원 시간대(리포트 응답의 timeZone).
 * 생략하면 브라우저 시간대(U-growth 의 startLogic 호출부가 회원 시간대를 넘기면 사라질 기본값).
 * 해석할 수 없으면 null.
 */
export function formatKoreanDate(
  iso: string | null | undefined,
  timeZone: string = browserTimeZone(),
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}년 ${pick("month")}월 ${pick("day")}일`;
}
