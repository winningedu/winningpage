/**
 * 시간대 기준 하루 경계 계산 (순수 함수, React 없음)
 *
 * 서버와 DB 는 UTC, 하루 단위 묶음은 항상 IANA 시간대를 인자로 받는다.
 * 날짜 라이브러리 없이 Intl.DateTimeFormat 만 쓴다.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterOf(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** instant 가 tz 에서 속한 달력 날짜 YYYY-MM-DD. */
export function ymdIn(instant: Date | string, tz: string): string {
  const parts = formatterOf(tz).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 달력 날짜에 일수를 더한다. 시간대와 무관한 순수 달력 계산. */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
