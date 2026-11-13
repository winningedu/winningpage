// 학년도 달력과 명단 올리기 방식. 어느 방식인지는 서버가 기관의 학년도와 달력으로 정한다(화면이 고르지 않는다).
//   rollover 기관의 학년도가 달력보다 뒤라 한 해 올린다(학년 +1, 졸업). toYear 는 기관의 다음 학년도.
//   midyear  기관이 이미 올해 학년도라 학년은 두고 그룹, 반, 번호만 바꾼다. toYear 는 기관의 학년도.

export type RosterMode = "rollover" | "midyear";

/** 학년도는 3월에 시작한다. fn_school_year_kst 와 같게 KST 시각에서 2개월을 뺀 해다. */
export function calendarSchoolYear(now: Date): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCMonth() >= 2
    ? kst.getUTCFullYear()
    : kst.getUTCFullYear() - 1;
}

/** 롤오버 RPC 가 한 해씩만 올리므로 두 해 이상 밀린 기관은 한 해씩 넘긴다. */
export function rosterModeOf(
  schoolYear: number,
  now: Date = new Date(),
): { mode: RosterMode; toYear: number } {
  return schoolYear >= calendarSchoolYear(now)
    ? { mode: "midyear", toYear: schoolYear }
    : { mode: "rollover", toYear: schoolYear + 1 };
}
