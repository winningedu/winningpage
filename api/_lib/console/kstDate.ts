// 콘솔 서버가 쓰는 KST 날짜 한 곳. 날짜 계산은 목표 계산이 쓰는 kstYMD, addDaysYMD 를 그대로 쓴다.

import { addDaysYMD, kstYMD } from "../../../src/lib/goal/calc/index.js";

/** KST 날짜(YYYY-MM-DD)에서 days 일 전. */
export function kstDateOffset(now: Date, days: number): string {
  return addDaysYMD(kstYMD(now), -days);
}
