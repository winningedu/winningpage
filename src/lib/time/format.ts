/**
 * 화면 표시용 날짜 서식 (순수 함수, React 없음)
 *
 * 시간대를 생략하면 브라우저 시간대로 보여 준다.
 */

import { ymdIn } from "./day.js";
import { browserTimeZone } from "./zone.js";

/** tz 의 YYYY-MM-DD. */
export function formatDate(instant: Date | string, tz?: string): string {
  return ymdIn(instant, tz ?? browserTimeZone());
}

/** tz 의 YYYY-MM-DD HH:mm (24시간). */
export function formatDateTime(instant: Date | string, tz?: string): string {
  const zoneName = tz ?? browserTimeZone();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneName,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${ymdIn(instant, zoneName)} ${get("hour")}:${get("minute")}`;
}
