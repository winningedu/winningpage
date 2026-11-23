import { ymdIn } from "@/lib/time/day";

/** 표지 날짜 표기 `2026. 10. 16` (회원 시간대 기준). 값이 없거나 날짜가 아니면 null. */
export function formatCoverDate(
  iso: string | null | undefined,
  timeZone: string,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return ymdIn(date, timeZone).replaceAll("-", ". ");
}

/** 기간 라벨 `2026-10-19 ~ 2026-10-25` 를 `2026. 10. 19 ~ 2026. 10. 25` 로. 두 날짜로 읽을 수 없으면 null. */
export function formatCoverPeriod(
  label: string | null | undefined,
): string | null {
  const [start, end, ...rest] = (label ?? "").split(" ~ ");
  if (rest.length > 0) return null;
  const from = formatCalendarDate(start ?? "");
  const to = formatCalendarDate(end ?? "");
  return from && to ? `${from} ~ ${to}` : null;
}

/** 달력 날짜 `YYYY-MM-DD` 는 시간대 변환 없이 그대로 `YYYY. MM. DD` 로 바꾼다. */
function formatCalendarDate(ymd: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.replaceAll("-", ". ") : null;
}
