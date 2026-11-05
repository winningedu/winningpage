// 코칭 판정 엔진(W9). 서비스 자료를 받아 판정, 6축 점수, 5대 역량, 종합 신호를 만드는 순수 함수 모음.
// 문구표(코칭 판정 문구표)와 6축 역량 연결표의 행을 그대로 옮긴다. 자료가 없는 지표는 분모에서 뺀다(결정 4).

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** 하루 기록. 시간 단위는 시간(소수 가능). 목표가 없는 날은 ideal 0. */
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
  achievementPct: number | null;
}

/**
 * 최근 7일 요약(연결표 r3, r4). 목표 설정일은 월~토 중 이상 목표가 있는 날이고 일요일은 넣지 않는다.
 * 달성율 = (설정일 실제 합 + 일요일 실제) ÷ 설정일 이상 목표 합 x 100, 화면 값은 100 을 넘을 수 있다.
 */
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

export type VerdictLevel = "good" | "caution" | "risk" | "no_data";

export interface Verdict {
  level: VerdictLevel;
  reason?: string;
}

export interface ExecutionInput {
  usesGoal: boolean;
  /** 마지막 접속 뒤 지난 날. 접속 기록을 읽지 못하면 없다(규칙 ⑵ 를 건너뛴다). */
  daysSinceLastSeen?: number | null;
  week?: GoalWeek;
}

/** 판정 축 ① 실행(문구표 r2~r8, 순서대로 첫 일치). */
export function executionVerdict(input: ExecutionInput): Verdict {
  if (!input.usesGoal || !input.week) return { level: "no_data" };
  const { setDays, metDays, achievementPct } = input.week;
  if ((input.daysSinceLastSeen ?? 0) >= 7) {
    return { level: "risk", reason: "미접속" };
  }
  if (setDays === 0 || achievementPct === null) {
    return { level: "no_data", reason: "목표 없음" };
  }
  if (metDays < setDays / 2) return { level: "risk", reason: "최소 미충족" };
  if (achievementPct < 40) return { level: "risk", reason: "달성율 낮음" };
  if (achievementPct >= 70 && metDays >= setDays - 1) return { level: "good" };
  return { level: "caution" };
}
