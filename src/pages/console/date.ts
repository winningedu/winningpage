// 콘솔 화면이 함께 쓰는 날짜 표기. 서버는 UTC 시각을 내리고, 화면이 브라우저 시간대로 바꿔 보여 준다.

import { diffDaysYMD } from "@/lib/goal/calc/index.js";
import { ymdIn } from "@/lib/time/day.js";
import { formatDate, formatDateTime } from "@/lib/time/format.js";
import { browserTimeZone } from "@/lib/time/zone.js";

/** 2026-11-05 를 2026.11.05 로. */
export const dotDate = (ymd: string) => ymd.replaceAll("-", ".");

/** 시각(ISO)을 tz(기본 브라우저 시간대)의 날짜 2026.11.05 로. */
export const dateOf = (iso: string, tz?: string) =>
  dotDate(formatDate(iso, tz));

/** 시각을 tz(기본 브라우저 시간대)의 2026.11.05 14:20 으로. */
export const dateTimeOf = (at: Date, tz?: string) =>
  dotDate(formatDateTime(at, tz));

/** 시각(ISO)이 tz(기본 브라우저 시간대) 달력으로 오늘이면 "오늘", 아니면 "n일 전". */
export const daysAgoText = (
  iso: string,
  now: Date,
  tz: string = browserTimeZone(),
) => {
  const days = diffDaysYMD(ymdIn(iso, tz), ymdIn(now, tz));
  return days <= 0 ? "오늘" : `${days}일 전`;
};
