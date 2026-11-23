// 리포트 날짜 표기. 모든 날짜는 한국 시간(KST) 기준이다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstParts(iso: string): { y: string; m: string; d: string } {
  const shifted = new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString();
  return {
    y: shifted.slice(0, 4),
    m: shifted.slice(5, 7),
    d: shifted.slice(8, 10),
  };
}

/** yyyy.mm.dd (02장, 03장, 04장 날짜). */
export function dotDate(iso: string): string {
  const { y, m, d } = kstParts(iso);
  return `${y}.${m}.${d}`;
}

/** yyyy. mm. dd (표지 저장일). */
export function coverDate(iso: string): string {
  const { y, m, d } = kstParts(iso);
  return `${y}. ${m}. ${d}`;
}

/** yyyy-mm-dd 날짜 문자열을 yyyy.mm.dd 로 바꾼다. */
export function dashToDot(date: string): string {
  return date.slice(0, 10).replace(/-/g, ".");
}

/** 학년도 기간(No.140). 해당 3월 1일 0시(KST)부터 다음 해 2월 말까지. 끝은 배타다. */
export function academicYearWindow(year: number): { from: string; to: string } {
  return {
    from: new Date(Date.UTC(year, 2, 1) - KST_OFFSET_MS).toISOString(),
    to: new Date(Date.UTC(year + 1, 2, 1) - KST_OFFSET_MS).toISOString(),
  };
}
