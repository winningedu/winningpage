// 코칭 판정 엔진 검증(W9). 문구표 r2~r22, 연결표 r2~r42, 결정 3, 4, 36 의 행마다 한 가지씩 확인한다.

import { describe, expect, test } from "vitest";
import {
  executionVerdict,
  type GoalDay,
  learningVerdict,
  linkageVerdict,
  summarizeGoalWeek,
  urgencyOf,
} from "./coaching.js";

// 오늘(11.02 월)부터 거꾸로 7일. 월~토는 목표 있는 날, 일요일(11.01)은 목표 없음.
const day = (
  date: string,
  weekday: GoalDay["weekday"],
  ideal: number,
  min: number,
  actual: number,
): GoalDay => ({ date, weekday, ideal, min, actual });

const THIS_WEEK: GoalDay[] = [
  day("11.02", "mon", 5, 3, 5),
  day("11.01", "sun", 0, 0, 0),
  day("10.31", "sat", 5, 3, 2),
  day("10.30", "fri", 5, 3, 4),
  day("10.29", "thu", 5, 3, 2),
  day("10.28", "wed", 5, 3, 5.5),
  day("10.27", "tue", 5, 3, 3),
];

describe("summarizeGoalWeek", () => {
  test("counts the target days, the met days and the weekly achievement with Sunday actual added (연결표 r3, r4)", () => {
    const week = summarizeGoalWeek(THIS_WEEK);
    expect(week.setDays).toBe(6);
    expect(week.metDays).toBe(4);
    // (5+2+4+2+5.5+3 + 일요일 0) / 30 = 21.5 / 30
    expect(week.achievementPct).toBeCloseTo(71.67, 1);
  });

  test("Sunday actual hours raise the achievement but Sunday is never a target day", () => {
    const week = summarizeGoalWeek(
      THIS_WEEK.map((d) => (d.weekday === "sun" ? { ...d, actual: 1.5 } : d)),
    );
    expect(week.setDays).toBe(6);
    expect(week.achievementPct).toBeCloseTo(76.67, 1);
  });

  test("a week without any target day has no achievement", () => {
    const week = summarizeGoalWeek(
      THIS_WEEK.map((d) => ({ ...d, ideal: 0, min: 0 })),
    );
    expect(week).toEqual({ setDays: 0, metDays: 0, achievementPct: null });
  });
});

describe("executionVerdict (문구표 r2~r8, first match wins)", () => {
  const week = (setDays: number, metDays: number, achievementPct: number) => ({
    setDays,
    metDays,
    achievementPct,
  });

  test("no goal service means no data", () => {
    expect(executionVerdict({ usesGoal: false })).toEqual({
      level: "no_data",
    });
  });

  test("a last visit 7 or more days ago is a risk with the reason 미접속", () => {
    expect(
      executionVerdict({
        usesGoal: true,
        daysSinceLastSeen: 7,
        week: week(6, 6, 90),
      }),
    ).toEqual({ level: "risk", reason: "미접속" });
  });

  test("no target day in the last 7 days means no data, not a risk (목표 없음)", () => {
    expect(
      executionVerdict({
        usesGoal: true,
        daysSinceLastSeen: 1,
        week: week(0, 0, 0),
      }),
    ).toEqual({ level: "no_data", reason: "목표 없음" });
  });

  test("fewer met days than half the target days is a risk (최소 미충족)", () => {
    expect(executionVerdict({ usesGoal: true, week: week(6, 2, 90) })).toEqual({
      level: "risk",
      reason: "최소 미충족",
    });
    // 경계: 3/6 은 설정일의 절반이라 이 규칙에 걸리지 않는다
    expect(
      executionVerdict({ usesGoal: true, week: week(6, 3, 90) }).level,
    ).not.toBe("risk");
  });

  test("an achievement under 40% is a risk (달성율 낮음)", () => {
    expect(executionVerdict({ usesGoal: true, week: week(6, 3, 39) })).toEqual({
      level: "risk",
      reason: "달성율 낮음",
    });
  });

  test("70% or more with at most one missed day is good", () => {
    expect(
      executionVerdict({ usesGoal: true, week: week(6, 5, 70) }).level,
    ).toBe("good");
    expect(
      executionVerdict({ usesGoal: true, week: week(6, 4, 90) }).level,
    ).toBe("caution");
    expect(
      executionVerdict({ usesGoal: true, week: week(6, 6, 69) }).level,
    ).toBe("caution");
  });

  test("the example student (72%, 4 of 6 days) is caution", () => {
    expect(executionVerdict({ usesGoal: true, week: week(6, 4, 72) })).toEqual({
      level: "caution",
    });
  });
});

// 학습진단 12영역 점수. 가장 낮은 영역 하나로 긴급도를 정한다.
const areas = (lowest: number) => ({
  GOAL: 80,
  PLAN: lowest,
  EXEC: 75,
  TIME: 72,
  FEEDBACK: 70,
  STABILITY: 90,
  SUBJECT: 80,
  PERFORM: 80,
  INQUIRY: 80,
  ACTIVITY: 80,
  RECORD: 80,
  STRATEGY: 80,
});

describe("urgencyOf (결정 3, 36: 가장 낮은 영역, 기준 45, 60, 70)", () => {
  test.each([
    [44, "very_high"],
    [45, "high"],
    [59, "high"],
    [60, "normal"],
    [69, "normal"],
    [70, "low"],
  ] as const)("the lowest area %i is %s", (lowest, level) => {
    expect(urgencyOf(areas(lowest))).toBe(level);
  });
});

describe("learningVerdict (문구표 r9~r12)", () => {
  const input = (lowest: number, executionAvg: number) => ({
    areas: areas(lowest),
    executionAvg,
  });

  test("no diagnosis means no data", () => {
    expect(learningVerdict(null)).toEqual({ level: "no_data" });
  });

  test("urgency high or the execution average under 50 is a risk", () => {
    expect(learningVerdict(input(59, 80)).level).toBe("risk");
    expect(learningVerdict(input(44, 80)).level).toBe("risk");
    expect(learningVerdict(input(65, 49.9)).level).toBe("risk");
  });

  test("an execution average of 75 or more is good", () => {
    expect(learningVerdict(input(65, 75)).level).toBe("good");
  });

  test("anything else is caution (the example student: lowest 60, average 62)", () => {
    expect(learningVerdict(input(60, 62)).level).toBe("caution");
    expect(learningVerdict(input(65, 74.9)).level).toBe("caution");
  });
});

describe("linkageVerdict (문구표 r13~r16, 진로 연결도)", () => {
  test.each([
    [null, "no_data"],
    [70, "good"],
    [69.9, "caution"],
    [50, "caution"],
    [49.9, "risk"],
  ] as const)("career link score %s is %s", (score, level) => {
    expect(linkageVerdict(score).level).toBe(level);
  });
});
