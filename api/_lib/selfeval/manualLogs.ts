// 수기 수행보고 메모의 순수 규칙(명세 No.158~161, 90, 91, 140). DB 와 모델 호출은 하지 않는다.

const pad = (n: number) => String(n).padStart(2, "0");

function lastDayOfFebruary(year: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 29 : 28;
}

/** 학년도 창. 학년도 Y 는 Y년 3월 1일부터 Y+1년 2월 말일까지다(한국 날짜, 명세 No.140). */
export function academicYearWindow(year: number): {
  start: string;
  end: string;
} {
  return {
    start: `${year}-03-01`,
    end: `${year + 1}-02-${pad(lastDayOfFebruary(year + 1))}`,
  };
}

/** 작성일(YYYY-MM-DD)이 학년도 창 안인지. 형식이 같은 문자열이라 사전순 비교로 충분하다. */
export function isInAcademicYear(date: string, year: number): boolean {
  const { start, end } = academicYearWindow(year);
  return date >= start && date <= end;
}
