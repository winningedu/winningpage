// 주간 목표시간 달성율(교 #5). 이번 주 월요일부터 오늘(KST)까지, 목표가 있는 날과 일요일의 학습시간 합을
// 목표가 있는 날의 이상 목표 합으로 나눈다. 대시보드(W5)와 학생 관리(W6)가 같은 값을 내도록 이 모듈만 쓴다.

import {
  addDaysYMD,
  getMondayYMD,
  kstYMD,
} from "../../../src/lib/goal/calc/index.js";

export const GOAL_RATE_LOW_BELOW = 40;
export const GOAL_RATE_HIGH_FROM = 70;

export interface DailyGoalRow {
  record_date: string;
  study_hours: number;
  target_ideal_hours: number;
}

/** 학생 한 명의 주간 달성율(%). 반올림도 상한도 두지 않는다. 목표가 있는 날이 없으면 0. */
export function weeklyRate(rows: DailyGoalRow[]): number {
  let study = 0;
  let target = 0;
  for (const r of rows) {
    const isSunday = new Date(`${r.record_date}T00:00:00Z`).getUTCDay() === 0;
    if (r.target_ideal_hours > 0 || isSunday) study += r.study_hours;
    if (r.target_ideal_hours > 0) target += r.target_ideal_hours;
  }
  return target > 0 ? (study / target) * 100 : 0;
}

/** 반올림한 정수로 3단계를 가른다(40 미만 낮음, 40 이상 70 미만 보통, 70 이상 높음). */
export function rateBucket(rate: number): "low" | "mid" | "high" {
  const rounded = Math.round(rate);
  if (rounded < GOAL_RATE_LOW_BELOW) return "low";
  if (rounded < GOAL_RATE_HIGH_FROM) return "mid";
  return "high";
}

/** 이번 주 월요일부터 today(기본 오늘 KST)까지의 날짜들. */
export function weeklyDates(today: string = kstYMD()): string[] {
  const dates: string[] = [];
  for (let d = getMondayYMD(today); d <= today; d = addDaysYMD(d, 1)) {
    dates.push(d);
  }
  return dates;
}
