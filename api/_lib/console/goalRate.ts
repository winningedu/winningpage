// 주간 목표시간 달성율과 최소 목표 충족일(교 #5, #6, #68, #82). 모든 콘솔 화면이 이 모듈 하나를 쓴다.
// 이번 주 = 어제까지 최근 7일(오늘 제외, KST), 지난주 = 그 전 7일. 7일에는 항상 월~토 6일과 일요일 1일이 들어간다.
// 목표가 있는데 기록이 없는 날은 학습시간 0 이다. 달성율 = (목표 설정일의 실제 합 + 일요일 실제) ÷ 목표 설정일의
// 이상 목표 합 x 100 이고 반올림도 상한도 두지 않는다(화면에서 반올림). 충족일은 목표 설정일 중 실제 >= 최소인 날이다.

import {
  addDaysYMD,
  kstYMD,
  VIRTUAL_DAY_NAMES,
} from "../../../src/lib/goal/calc/index.js";

export const GOAL_RATE_LOW_BELOW = 40;
export const GOAL_RATE_HIGH_FROM = 70;

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** 하루 기록. 목표가 없는 날은 ideal 0. 시간 단위는 시간(소수 가능). */
export interface GoalDay {
  date: string;
  weekday: Weekday;
  ideal: number;
  min: number;
  actual: number;
}

export interface GoalWeek {
  setDays: number;
  metDays: number;
  /** 목표 설정일이 없으면 null. */
  achievementPct: number | null;
}

export interface GoalRecord {
  record_date: string;
  study_hours: number;
  target_ideal_hours: number;
  target_min_hours: number;
}

/** goal_students.study_schedule 의 요일별 목표(monday ~ sunday). */
export type GoalSchedule = Record<
  string,
  { ideal?: unknown; min?: unknown } | undefined
>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** today(기본 오늘 KST) 를 뺀 최근 7일(이번 주)과 그 전 7일(지난주). 날짜는 오래된 날부터. */
export function weekWindows(today: string = kstYMD()): {
  thisWeek: string[];
  previousWeek: string[];
} {
  const week = (endOffset: number) =>
    Array.from({ length: 7 }, (_, i) => addDaysYMD(today, endOffset - 6 + i));
  return { thisWeek: week(-1), previousWeek: week(-8) };
}

const weekdayOf = (date: string): Weekday =>
  // getUTCDay: 0 이 일요일이라 월요일 시작 순서로 맞춘다.
  WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7] ?? "mon";

/**
 * 날짜마다 하루 기록을 만든다. 그날 기록이 있으면 기록의 목표와 학습시간을, 없으면 요일별 계획의 목표와
 * 학습시간 0 을 쓴다.
 */
export function buildGoalDays(
  dates: string[],
  records: GoalRecord[],
  schedule: GoalSchedule | null,
): GoalDay[] {
  const byDate = new Map(records.map((r) => [r.record_date, r]));
  return dates.map((date) => {
    const weekday = weekdayOf(date);
    const rec = byDate.get(date);
    const planned =
      schedule?.[VIRTUAL_DAY_NAMES[WEEKDAYS.indexOf(weekday)] ?? ""];
    return {
      date,
      weekday,
      ideal: rec ? num(rec.target_ideal_hours) : num(planned?.ideal),
      min: rec ? num(rec.target_min_hours) : num(planned?.min),
      actual: rec ? num(rec.study_hours) : 0,
    };
  });
}

/** 7일 요약. 목표 설정일은 월~토 중 이상 목표가 있는 날이고 일요일은 넣지 않는다. */
export function summarizeGoalWeek(days: GoalDay[]): GoalWeek {
  const setDays = days.filter((d) => d.weekday !== "sun" && d.ideal > 0);
  if (setDays.length === 0) {
    return { setDays: 0, metDays: 0, achievementPct: null };
  }
  const idealSum = setDays.reduce((sum, d) => sum + d.ideal, 0);
  const actualSum =
    setDays.reduce((sum, d) => sum + d.actual, 0) +
    days
      .filter((d) => d.weekday === "sun")
      .reduce((sum, d) => sum + d.actual, 0);
  return {
    setDays: setDays.length,
    metDays: setDays.filter((d) => d.actual >= d.min).length,
    achievementPct: (actualSum / idealSum) * 100,
  };
}

/** 한 번 읽은 기록으로 이번 주와 지난주를 함께 요약한다. */
export function goalWeeks(
  today: string,
  records: GoalRecord[],
  schedule: GoalSchedule | null,
): { thisWeek: GoalWeek; previousWeek: GoalWeek } {
  const { thisWeek, previousWeek } = weekWindows(today);
  return {
    thisWeek: summarizeGoalWeek(buildGoalDays(thisWeek, records, schedule)),
    previousWeek: summarizeGoalWeek(
      buildGoalDays(previousWeek, records, schedule),
    ),
  };
}

/** 반올림한 정수로 3단계를 가른다(40 미만 낮음, 40 이상 70 미만 보통, 70 이상 높음). */
export function rateBucket(rate: number): "low" | "mid" | "high" {
  const rounded = Math.round(rate);
  if (rounded < GOAL_RATE_LOW_BELOW) return "low";
  if (rounded < GOAL_RATE_HIGH_FROM) return "mid";
  return "high";
}
