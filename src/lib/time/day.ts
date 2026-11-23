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

/** YYYY-MM-DD 를 [연, 월, 일] 숫자로 푼다. */
function parseYmd(ymd: string): [number, number, number] {
  const [y = 0, m = 0, d = 0] = ymd.split("-").map(Number);
  return [y, m, d];
}

/** instant 가 tz 에서 속한 달력 날짜 YYYY-MM-DD. */
export function ymdIn(instant: Date | string, tz: string): string {
  const parts = formatterOf(tz).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 달력 날짜에 일수를 더한다. 시간대와 무관한 순수 달력 계산. */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = parseYmd(ymd);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * tz 에서 ymd 하루의 첫 순간(ISO Z).
 * 자정이 서머타임 공백에 들면 실제로 존재하는 첫 순간을 돌려준다.
 */
export function dayStartUtc(ymd: string, tz: string): string {
  const [y, m, d] = parseYmd(ymd);
  const target = Date.UTC(y, m - 1, d);
  const HOUR = 3_600_000;
  // 오프셋은 -12h~+14h 라서 하루의 첫 순간은 target 기준 이 구간 안에 있다.
  let lo = target - 15 * HOUR; // 현지 날짜가 ymd 보다 앞선다
  let hi = target + 13 * HOUR; // 현지 날짜가 ymd 이상이다
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (ymdIn(new Date(mid), tz) >= ymd) hi = mid;
    else lo = mid;
  }
  return new Date(hi).toISOString();
}

/** 양끝 포함 날짜 구간을 [from, toExclusive) 순간 구간으로 바꾼다. */
export function dayRangeUtc(
  fromYmd: string,
  toYmd: string,
  tz: string,
): { from: string; toExclusive: string } {
  return {
    from: dayStartUtc(fromYmd, tz),
    toExclusive: dayStartUtc(addDaysYmd(toYmd, 1), tz),
  };
}

/**
 * DB fn_add_months 와 같다. 현지 하루 시작으로 자르고 달력 개월을 더한다.
 * 말일은 보정한다(1/31 + 1개월 = 2/28).
 */
export function addMonthsIn(
  instant: Date | string,
  months: number,
  tz: string,
): string {
  const [y, m, d] = parseYmd(ymdIn(instant, tz));
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = total - ty * 12; // 0 기반
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const ymd = `${pad(ty, 4)}-${pad(tm + 1)}-${pad(Math.min(d, lastDay))}`;
  return dayStartUtc(ymd, tz);
}

/** 학년도는 3월 1일에 시작한다. 현지 3월 이후면 현지 연도, 아니면 전년도. */
export function schoolYearOf(instant: Date | string, tz: string): number {
  const [y, m] = parseYmd(ymdIn(instant, tz));
  return m >= 3 ? y : y - 1;
}
