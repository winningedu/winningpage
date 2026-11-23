// 학년도 달력과 명단 올리기 방식. 어느 방식인지는 서버가 기관의 학년도와 달력으로 정한다(화면이 고르지 않는다).
//   rollover 기관의 학년도가 달력보다 뒤라 한 해 올린다(학년 +1, 졸업). toYear 는 기관의 다음 학년도.
//   midyear  기관이 이미 올해 학년도라 학년은 두고 그룹, 반, 번호만 바꾼다. toYear 는 기관의 학년도.

import { schoolYearOf } from "../../../src/lib/time/day.js";

export type RosterMode = "rollover" | "midyear";

/** 학년도는 3월에 시작한다. fn_school_year 와 같게 기관 시간대의 현지 달력으로 정한다. */
export function calendarSchoolYear(now: Date, timeZone: string): number {
  return schoolYearOf(now, timeZone);
}

/** 롤오버 RPC 가 한 해씩만 올리므로 두 해 이상 밀린 기관은 한 해씩 넘긴다. */
export function rosterModeOf(
  schoolYear: number,
  timeZone: string,
  now: Date = new Date(),
): { mode: RosterMode; toYear: number } {
  return schoolYear >= calendarSchoolYear(now, timeZone)
    ? { mode: "midyear", toYear: schoolYear }
    : { mode: "rollover", toYear: schoolYear + 1 };
}
