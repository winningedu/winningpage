import { describe, expect, it } from "vitest";
import { buildWeeklySchedule, validateWeekScheduleDay } from "./intake.js";

// QA 행293 — Step7(하루 일정)이 단일 세트 4필드에서 요일별 {wake, sleep, hasSchool,
// schoolStart, schoolEnd, academies[]}로 바뀌었다. 서버 검증기(validateWeekScheduleDay)와
// 파생값 배선(buildWeeklySchedule)을 직접 단위 테스트한다 — intake.studyHours.test.ts와
// 같은 패턴(전체 HTTP 핸들러가 아니라 export된 순수 함수만 검증).
const VALID_DAY = {
  wake: 6,
  sleep: 24,
  hasSchool: true,
  schoolStart: 8.5,
  schoolEnd: 16.5,
  academies: [
    { start: 17.5, end: 19 },
    { start: 20, end: 22 },
  ],
};

describe("validateWeekScheduleDay", () => {
  it("정상 입력을 통과시키고 값을 그대로 정규화한다", () => {
    const result = validateWeekScheduleDay(VALID_DAY, "월요일");
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual(VALID_DAY);
  });

  it("객체가 아니면 거절한다", () => {
    expect(validateWeekScheduleDay(null, "월요일").error).toBeDefined();
    expect(
      validateWeekScheduleDay("월요일 일정", "월요일").error,
    ).toBeDefined();
    expect(validateWeekScheduleDay(undefined, "월요일").error).toBeDefined();
  });

  it("취침이 기상보다 늦지 않으면 거절한다", () => {
    const result = validateWeekScheduleDay(
      { ...VALID_DAY, sleep: 6 },
      "월요일",
    );
    expect(result.error?.body.detail).toMatch(/취침 시각은 기상 시각보다/);
  });

  it("hasSchool이 boolean이 아니면 거절한다", () => {
    const result = validateWeekScheduleDay(
      { ...VALID_DAY, hasSchool: "yes" },
      "월요일",
    );
    expect(result.error).toBeDefined();
  });

  it("hasSchool=true인데 하교가 등교보다 늦지 않으면 거절한다", () => {
    const result = validateWeekScheduleDay(
      { ...VALID_DAY, schoolEnd: 8 },
      "월요일",
    );
    expect(result.error?.body.detail).toMatch(/하교 시각은 등교 시각보다/);
  });

  // hasSchool=false 인 요일도 schoolStart/schoolEnd 값 자체는 항상 유지・검증한다
  // (GoalOnboardingContext.tsx DayScheduleInput 주석 참고 — 토글을 다시 켰을 때 입력을
  // 잃지 않기 위해서다). 다만 "하교가 등교보다 늦어야 한다" 역전 검사는 hasSchool=true일
  // 때만 강제한다 — 계산에 반영되지 않는 값까지 막을 이유가 없다.
  it("hasSchool=false면 등하교 역전이어도 통과한다(계산에 반영되지 않으므로)", () => {
    const result = validateWeekScheduleDay(
      { ...VALID_DAY, hasSchool: false, schoolStart: 16, schoolEnd: 8 },
      "토요일",
    );
    expect(result.error).toBeUndefined();
  });

  it("학원이 상한(5건)을 넘으면 거절한다", () => {
    const academies = Array.from({ length: 6 }, () => ({ start: 17, end: 18 }));
    const result = validateWeekScheduleDay(
      { ...VALID_DAY, academies },
      "월요일",
    );
    expect(result.error?.body.detail).toMatch(/최대 5개/);
  });

  it("학원 하원이 등원보다 늦지 않으면 거절한다", () => {
    const result = validateWeekScheduleDay(
      { ...VALID_DAY, academies: [{ start: 19, end: 17 }] },
      "월요일",
    );
    expect(result.error?.body.detail).toMatch(/학원 하원 시각은 등원 시각보다/);
  });

  it("범위(0~30)를 벗어난 시각은 거절한다", () => {
    expect(
      validateWeekScheduleDay({ ...VALID_DAY, sleep: 31 }, "월요일").error,
    ).toBeDefined();
    expect(
      validateWeekScheduleDay({ ...VALID_DAY, wake: -1 }, "월요일").error,
    ).toBeDefined();
  });

  it("숫자로 해석할 수 없는 값(boolean 등)은 거절한다 — isNumericInput 가드", () => {
    expect(
      validateWeekScheduleDay({ ...VALID_DAY, wake: true }, "월요일").error,
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// buildWeeklySchedule — 파생값 week_ideal/min (QA 행293 검산 예시)
// ---------------------------------------------------------------------------

const OTHER_DAY = {
  wake: 7,
  sleep: 24,
  hasSchool: false,
  schoolStart: 8.5,
  schoolEnd: 16.5,
  academies: [],
};

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function weekOf(monday: typeof VALID_DAY) {
  return Object.fromEntries(
    DAY_KEYS.map((key) => [key, key === "monday" ? monday : OTHER_DAY]),
  );
}

const ZERO_STUDY_HOURS = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((key) => [key, 0]),
);

describe("buildWeeklySchedule", () => {
  it("QA 행293 검산 예시(가용 6.5h)에 대학 배율을 곱한 값을 산출한다", () => {
    const result = buildWeeklySchedule({
      ideal: { university: "서울대학교", department: "경영학과" }, // 배율 0.78
      min: { university: "부산대학교", department: "경영학과" }, // 배율 0.52
      studyHours: ZERO_STUDY_HOURS,
      weekSchedule: weekOf(VALID_DAY),
    });

    // 가용시간 6.5h(계산식은 schedule.test.ts "QA 행293 검산 예시"가 이미 고정) ×
    // idealMult 0.78 = 5.07 → round1 5.1 / minMult 0.52 = 3.38 → round1 3.4
    expect(result.monday?.ideal).toBeCloseTo(5.1, 5);
    expect(result.monday?.min).toBeCloseTo(3.4, 5);
  });

  it("학생 자습시간이 계산된 이상 목표보다 크면 오버라이드된다(+0.5/+1.0)", () => {
    const result = buildWeeklySchedule({
      ideal: { university: "서울대학교", department: "경영학과" },
      min: { university: "부산대학교", department: "경영학과" },
      studyHours: { ...ZERO_STUDY_HOURS, mon: 6 }, // calcIdeal(5.1)보다 큼
      weekSchedule: weekOf(VALID_DAY),
    });

    expect(result.monday?.min).toBeCloseTo(6.5, 5);
    expect(result.monday?.ideal).toBeCloseTo(7, 5);
  });
});
