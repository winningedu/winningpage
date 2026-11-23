// 리포트 날짜 표기. 모든 날짜는 회원 시간대(profiles.time_zone 또는 보는 사람의 X-Time-Zone) 기준이다.

import { dayStartUtc, ymdIn } from "../../../../src/lib/time/day.js";

function localParts(
  iso: string,
  tz: string,
): { y: string; m: string; d: string } {
  const [y = "", m = "", d = ""] = ymdIn(iso, tz).split("-");
  return { y, m, d };
}

/** yyyy.mm.dd (02장, 03장, 04장 날짜). */
export function dotDate(iso: string, tz: string): string {
  const { y, m, d } = localParts(iso, tz);
  return `${y}.${m}.${d}`;
}

/** yyyy. mm. dd (표지 저장일). */
export function coverDate(iso: string, tz: string): string {
  const { y, m, d } = localParts(iso, tz);
  return `${y}. ${m}. ${d}`;
}

/** yyyy-mm-dd 날짜 문자열을 yyyy.mm.dd 로 바꾼다. */
export function dashToDot(date: string): string {
  return date.slice(0, 10).replace(/-/g, ".");
}

/** 학년도 기간(No.140). 회원 시간대 3월 1일 0시부터 다음 해 3월 1일 0시 전까지. 끝은 배타다. */
export function academicYearWindow(
  year: number,
  tz: string,
): { from: string; to: string } {
  return {
    from: dayStartUtc(`${year}-03-01`, tz),
    to: dayStartUtc(`${year + 1}-03-01`, tz),
  };
}
