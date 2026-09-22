// pipeline.js 시나리오 테스트.
//
// calcStudentBonusRates 가 로컬 타임존 기준으로 D-day 를 계산한다(bonus.test.js:13-16 참고).
// 이 파일도 같은 이유로 TZ 를 고정한다.
process.env.TZ = "Asia/Seoul";

import { expect, test } from "vitest";

import type { StudentState } from "./pipeline.ts";
import {
  applyDailyRecord,
  buildInitialStudentState,
  getConversionTypeForStudent,
  isElementaryStudent,
  isMiddleStudent,
  isPreHighStudent,
} from "./pipeline.ts";
import { applyPreHighGradePenalty, calcNaesinProb } from "./primitives.ts";
import { VIRTUAL_DAY_NAMES } from "./schedule.ts";

// bonus.js:96-125 를 그대로 복제해 D-day 일수를 독립적으로 구한다(검증용 — 손계산이 아니라
// 원본과 동일한 코드를 실행해서 기대값을 만든다). 고2 이하 학년의 오프셋만 옮겼다(이 파일에서
// 쓰는 시나리오가 고3/고2 뿐이라서다 — bonus.js:110-122 전체 표는 원본에 있다).
function calcExpectedDDays(grade, nowInput) {
  const now = new Date(nowInput.getTime());
  now.setHours(0, 0, 0, 0);
  const y = now.getFullYear();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  let susiBase = new Date(y, 8, 12);
  let jungsiBase = new Date(y, 10, 19);
  if (susiBase <= now) susiBase = new Date(y + 1, 8, 12);
  if (jungsiBase <= now) jungsiBase = new Date(y + 1, 10, 19);
  const daysToSusi = Math.max(
    1,
    Math.ceil((susiBase.getTime() - now.getTime()) / MS_PER_DAY),
  );
  const daysToJungsi = Math.max(
    1,
    Math.ceil((jungsiBase.getTime() - now.getTime()) / MS_PER_DAY),
  );
  let offset = 0;
  if (grade === "고2") offset = 365;
  else if (grade === "고1") offset = 730;
  return {
    totalSusiDays: daysToSusi + offset,
    totalJungsiDays: daysToJungsi + offset,
  };
}

// achievement/focus/달성률/과목태그 네 배수를 전부 정확히 1.0 으로 맞춰 매일 기록하고,
// 각 확률이 100에 도달하는 제출 회차(1부터 시작)를 돌려준다.
function runCalibratedLoop(
  state: StudentState,
  dayHours: number,
  maxDays: number,
) {
  const reach: Record<string, number> = {};
  for (let day = 0; day < maxDays; day += 1) {
    state = applyDailyRecord(state, {
      achievement: "full", // ACHIEVEMENT_MULTIPLIER.full = 1.0 (bonus.js:27)
      focus: "good", // FOCUS_MULTIPLIER.good = 1.0 (bonus.js:38)
      tasks: [], // 과목 태그 없음 → TASK_BONUS_MULTIPLIER(1.1) 미적용 (bonus.js:237-244)
      studyHours: dayHours, // idealHours === minHours === dayHours → 두 달성률 모두 정확히 100%
      virtualDayIndex: day % 7,
    });
    for (const key of ["idealSusi", "idealJungsi", "minSusi", "minJungsi"]) {
      if (reach[key] === undefined && state[key] === 100) reach[key] = day + 1;
    }
  }
  return { state, reach };
}

// runCalibratedLoop 과 동일하지만 매일 제출하는 studyHours 를 별도로 받는다 — 요일별 목표
// (state.weeklySchedule)와 제출 시간이 서로 다른(=달성률이 100%가 아닌) 시나리오2-c 용.
function runCalibratedLoopFixedHours(
  state: StudentState,
  studyHours: number,
  maxDays: number,
) {
  const reach: Record<string, number> = {};
  for (let day = 0; day < maxDays; day += 1) {
    state = applyDailyRecord(state, {
      achievement: "full",
      focus: "good",
      tasks: [],
      studyHours,
      virtualDayIndex: day % 7,
    });
    for (const key of ["idealSusi", "idealJungsi", "minSusi", "minJungsi"]) {
      if (reach[key] === undefined && state[key] === 100) reach[key] = day + 1;
    }
  }
  return { state, reach };
}

// ── 공용 픽스처 ──────────────────────────────────────────────────────────

// 모든 요일에 동일한 생활 패턴을 주는 scheduleForm. calculateWeekSchedule 의 원본 계약
// (요일별 기상/취침/등하교/학원 + 대학·학과 배율)을 그대로 쓴다.
function makeScheduleForm({ idealUniv, idealDept, minUniv, minDept }) {
  const weekdayDay = {
    wake: "7",
    sleep: "24",
    schoolStart: "8",
    schoolEnd: "16",
    academies: [{ start: "18", end: "20" }],
  };
  const weekendDay = {
    wake: "8",
    sleep: "24",
    schoolStart: "",
    schoolEnd: "",
    academies: [{ start: "14", end: "16" }],
  };

  return {
    idealUniv,
    idealDept,
    minUniv,
    minDept,
    weekSchedule: {
      monday: weekdayDay,
      tuesday: weekdayDay,
      wednesday: weekdayDay,
      thursday: weekdayDay,
      friday: weekdayDay,
      saturday: weekendDay,
      sunday: weekendDay,
    },
    selfStudyHours: {},
  };
}

function makeMogoScores() {
  return {
    고3_3모: {
      kor: { percentile: 80 },
      math: { percentile: 75 },
      exp1: { percentile: 70 },
      exp2: { percentile: 65 },
      eng: "2",
    },
    고3_6모: {
      kor: { percentile: 82 },
      math: { percentile: 78 },
      exp1: { percentile: 72 },
      exp2: { percentile: 68 },
      eng: "2",
    },
  };
}

// ── 시나리오 1: 고3 일반고 학생 1명 온보딩 ─────────────────────────────────

test("시나리오1 — 고3 일반고 학생 온보딩: 확률 4종·목표시간이 정의역 안에 있다", () => {
  const state = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 2.3,
    mogoScores: makeMogoScores(),
    lastNaesin: "1학기 중간",
    lastMogo: "6모",
    cuts: { idealNaesin: 1.5, idealJungsi: 70, minNaesin: 3.0, minJungsi: 60 },
    scheduleForm: makeScheduleForm({
      idealUniv: "연세대학교",
      idealDept: "컴퓨터공학과",
      minUniv: "건국대학교",
      minDept: "경영학과",
    }),
  });

  for (const key of ["idealSusi", "idealJungsi", "minSusi", "minJungsi"]) {
    expect(
      state[key] >= 0 && state[key] <= 100,
      `${key} 는 [0,100] 안에 있어야 한다 (실제 ${state[key]})`,
    ).toBeTruthy();
  }

  expect(
    state.weekIdeal > 0,
    `weekIdeal 은 양수여야 한다 (실제 ${state.weekIdeal})`,
  ).toBeTruthy();
  expect(
    state.weekMin > 0,
    `weekMin 은 양수여야 한다 (실제 ${state.weekMin})`,
  ).toBeTruthy();

  // 고3은 conversionType 이 없어 변환등급표 없이도 동작해야 한다(student.mjs:646-651).
  expect(state.convertedGradeRaw).toBe(2.3);
  // applyPreHighGradePenalty 는 페널티 0이어도 [1,9] 클램프를 거친다(primitives.js:166-169).
  expect(state.convertedGrade >= 1 && state.convertedGrade <= 9).toBeTruthy();

  // 남은 시험 회차: 고3_1학기 중간 → 순번9 → 잔여1 / 고3_6모 → 순번11 → 잔여3.
  expect(state.remainNaesin).toBe(1);
  expect(state.remainMogo).toBe(3);

  // rate 4종도 계산되어 있어야 한다(다음 시나리오에서 씀).
  for (const key of [
    "idealSusiBonus",
    "idealJungsiBonus",
    "minSusiBonus",
    "minJungsiBonus",
  ]) {
    expect(typeof state.rates[key]).toBe("number");
    expect(
      !Number.isNaN(state.rates[key]),
      `rates.${key} 는 NaN 이면 안 된다`,
    ).toBeTruthy();
  }
});

test("시나리오1 — cuts 미주입 시 명시적으로 실패한다(임의 값으로 지어내지 않는다)", () => {
  expect(() =>
    buildInitialStudentState({
      schoolType: "일반고",
      grade: "고3",
      currentScore: 2.3,
      weeklySchedule: { monday: { ideal: 1, min: 1 } },
    }),
  ).toThrow(/cuts/);
});

test("시나리오1 — 변환등급표가 필요한 학년(고1)은 convertedGrade 미주입 시 명시적으로 실패한다", () => {
  expect(() =>
    buildInitialStudentState({
      schoolType: "일반고",
      grade: "고1",
      currentScore: 2.3,
      weeklySchedule: { monday: { ideal: 1, min: 1 } },
      cuts: {
        idealNaesin: 1.5,
        idealJungsi: 70,
        minNaesin: 3.0,
        minJungsi: 60,
      },
    }),
  ).toThrow(/미지원.*grade_conversions/);
});

// ── 시나리오 2: 게이지 누적 — 완벽 기록을 D-day까지 반복하면 100%에 도달한다 ──

test("시나리오2 — 완벽 기록을 D-day까지 반복하면 확률이 단조 증가해 100%에 도달한다", () => {
  // D-day 를 짧게 잡기 위해 기준 시각을 9/12(수시)·11/19(정시) 직전으로 둔다.
  const now = new Date(2026, 8, 1); // 2026-09-01 (월=8 은 0-base 9월)

  const dayIdeal = 2;
  const dayMin = 1;
  const weeklySchedule = Object.fromEntries(
    VIRTUAL_DAY_NAMES.map((name) => [name, { ideal: dayIdeal, min: dayMin }]),
  );

  let state = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 4.0,
    currentMogo: 50,
    lastNaesin: "1학기 중간",
    lastMogo: "3모",
    cuts: { idealNaesin: 1.5, idealJungsi: 80, minNaesin: 3.0, minJungsi: 60 },
    weeklySchedule,
    now,
  });

  // 기준확률이 이미 100이면 "게이지가 차오르는" 과정을 검증할 수 없으므로 사전 조건으로 못박는다.
  for (const key of ["idealSusi", "idealJungsi", "minSusi", "minJungsi"]) {
    expect(
      state[key] < 100,
      `사전조건 실패: 기준 ${key} 가 이미 100이다 (${state[key]})`,
    ).toBeTruthy();
  }

  // 원본에서 calcStudentBonusRates 가 딱 한 번만 호출되므로(student.mjs 전체에서 이 한 곳뿐),
  // rate 는 최초 계산값을 그대로 매일 재사용한다. totalSusiDays/totalJungsiDays 는 여기서
  // 직접 다시 구하지 않고, "정시가 수시보다 항상 늦다(9/12 < 11/19)"는 원본 상수 관계만 이용해
  // 정시 D-day 까지 넉넉히 돈 뒤 수시가 그보다 먼저 100%에 도달했는지를 매 반복마다 관찰한다.
  const MAX_DAYS = 400; // 정시 기준일(11/19)까지 최악의 경우도 넉넉히 덮는 상한
  let susiReachedAtDay: number | null = null;
  let jungsiReachedAtDay: number | null = null;
  const prev = {
    idealSusi: state.idealSusi,
    idealJungsi: state.idealJungsi,
    minSusi: state.minSusi,
    minJungsi: state.minJungsi,
  };

  let day = 0;
  while (
    day < MAX_DAYS &&
    (susiReachedAtDay === null || jungsiReachedAtDay === null)
  ) {
    const virtualDayIndex = day % 7;
    state = applyDailyRecord(state, {
      achievement: "full",
      focus: "good",
      tasks: [],
      studyHours: dayIdeal,
      virtualDayIndex,
    });

    // 단조 증가(감소 없음) 검증.
    for (const key of ["idealSusi", "idealJungsi", "minSusi", "minJungsi"]) {
      expect(
        state[key] >= prev[key] - 1e-9,
        `${key} 는 완벽 기록 하에서 감소하면 안 된다 (day ${day}: ${prev[key]} → ${state[key]})`,
      ).toBeTruthy();
      prev[key] = state[key];
    }

    if (
      susiReachedAtDay === null &&
      state.idealSusi === 100 &&
      state.minSusi === 100
    ) {
      susiReachedAtDay = day;
    }
    if (
      jungsiReachedAtDay === null &&
      state.idealJungsi === 100 &&
      state.minJungsi === 100
    ) {
      jungsiReachedAtDay = day;
    }

    day += 1;
  }

  expect(
    susiReachedAtDay !== null,
    `수시 확률(이상/최소)이 ${MAX_DAYS}일 안에 100%에 도달하지 못했다 — 조립이 틀렸거나 원본 이해가 틀렸다. ` +
      `마지막 상태: idealSusi=${state.idealSusi}, minSusi=${state.minSusi}`,
  ).toBeTruthy();
  expect(
    jungsiReachedAtDay !== null,
    `정시 확률(이상/최소)이 ${MAX_DAYS}일 안에 100%에 도달하지 못했다 — 조립이 틀렸거나 원본 이해가 틀렸다. ` +
      `마지막 상태: idealJungsi=${state.idealJungsi}, minJungsi=${state.minJungsi}`,
  ).toBeTruthy();
  // 수시 기준일(9/12)이 정시 기준일(11/19)보다 항상 먼저다 → 수시가 정시보다 먼저(또는 같은 날) 100%에 닿아야 한다.
  expect(
    susiReachedAtDay! <= jungsiReachedAtDay!,
    `수시 D-day(9/12)가 정시 D-day(11/19)보다 이르므로 수시가 먼저 100%에 도달해야 한다 ` +
      `(susi=${susiReachedAtDay}일차, jungsi=${jungsiReachedAtDay}일차)`,
  ).toBeTruthy();

  // 도달 이후에는 계속 100%로 유지되어야 한다(클램프가 영구적이다).
  state = applyDailyRecord(state, {
    achievement: "full",
    focus: "good",
    tasks: [],
    studyHours: dayIdeal,
    virtualDayIndex: day % 7,
  });
  expect(state.idealSusi).toBe(100);
  expect(state.idealJungsi).toBe(100);
  expect(state.minSusi).toBe(100);
  expect(state.minJungsi).toBe(100);
});

// ── 시나리오 3: 0시간 제출 — rate 전액 차감이 확률을 떨어뜨린다 ────────────

test("시나리오3 — 0시간 제출은 그날치 rate 전액을 차감해 확률을 떨어뜨린다", () => {
  const weeklySchedule = Object.fromEntries(
    VIRTUAL_DAY_NAMES.map((name) => [name, { ideal: 3, min: 1.5 }]),
  );

  const initial = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 3.5,
    currentMogo: 55,
    lastNaesin: "1학기 중간",
    lastMogo: "3모",
    cuts: { idealNaesin: 1.5, idealJungsi: 80, minNaesin: 3.0, minJungsi: 60 },
    weeklySchedule,
  });

  const after = applyDailyRecord(initial, {
    achievement: "full",
    focus: "good",
    tasks: [],
    studyHours: 0,
    virtualDayIndex: 0, // monday, ideal=3/min=1.5 (둘 다 0 초과이므로 감점 분기를 탄다)
  });

  expect(
    after.idealSusi < initial.idealSusi,
    `0시간 제출은 idealSusi 를 떨어뜨려야 한다 (${initial.idealSusi} → ${after.idealSusi})`,
  ).toBeTruthy();
  expect(
    after.idealJungsi < initial.idealJungsi,
    `0시간 제출은 idealJungsi 를 떨어뜨려야 한다 (${initial.idealJungsi} → ${after.idealJungsi})`,
  ).toBeTruthy();
  expect(
    after.minSusi < initial.minSusi,
    `0시간 제출은 minSusi 를 떨어뜨려야 한다 (${initial.minSusi} → ${after.minSusi})`,
  ).toBeTruthy();
  expect(
    after.minJungsi < initial.minJungsi,
    `0시간 제출은 minJungsi 를 떨어뜨려야 한다 (${initial.minJungsi} → ${after.minJungsi})`,
  ).toBeTruthy();

  // bonus.js:208-217 — 차감폭은 정확히 해당 rate 만큼이다.
  expect(after.cumulativeBonus.idealSusi).toBe(-initial.rates.idealSusiBonus);
  expect(after.cumulativeBonus.idealJungsi).toBe(
    -initial.rates.idealJungsiBonus,
  );
  expect(after.cumulativeBonus.minSusi).toBe(-initial.rates.minSusiBonus);
  expect(after.cumulativeBonus.minJungsi).toBe(-initial.rates.minJungsiBonus);
});

test("시나리오3 — 그날 목표가 0시간(일요일 보충 없음)이면 0시간 제출은 감점하지 않는다", () => {
  const weeklySchedule = Object.fromEntries(
    VIRTUAL_DAY_NAMES.map((name) => [name, { ideal: 3, min: 1.5 }]),
  );
  weeklySchedule.sunday = { ideal: 0, min: 0 };

  const initial = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 3.5,
    currentMogo: 55,
    lastNaesin: "1학기 중간",
    lastMogo: "3모",
    cuts: { idealNaesin: 1.5, idealJungsi: 80, minNaesin: 3.0, minJungsi: 60 },
    weeklySchedule,
  });

  const after = applyDailyRecord(initial, {
    achievement: "full",
    focus: "good",
    tasks: [],
    studyHours: 0,
    virtualDayIndex: 6, // sunday, ideal=0/min=0 → bonus.js:200-202 무감점 분기
  });

  expect(after.idealSusi).toBe(initial.idealSusi);
  expect(after.idealJungsi).toBe(initial.idealJungsi);
  expect(after.minSusi).toBe(initial.minSusi);
  expect(after.minJungsi).toBe(initial.minJungsi);
});

// ── 시나리오 4: 경계 — 확률은 [0,100] 을 벗어나지 않는다 ───────────────────

test("시나리오4 — 0시간 제출을 아주 여러 번 반복해도 확률은 0 밑으로 내려가지 않는다", () => {
  const weeklySchedule = Object.fromEntries(
    VIRTUAL_DAY_NAMES.map((name) => [name, { ideal: 3, min: 1.5 }]),
  );

  let state = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 1.2,
    currentMogo: 90,
    lastNaesin: "1학기 중간",
    lastMogo: "3모",
    cuts: { idealNaesin: 5.0, idealJungsi: 10, minNaesin: 5.0, minJungsi: 10 },
    weeklySchedule,
  });

  // 0시간 제출은 매일 idealSusiBonus rate(이 프로필은 0.0462)만큼만 깎는다
  // (bonus.js: studyHours===0 분기는 성취/집중 배율을 무시하고 -rate 고정).
  // base idealSusi=83.6 이라 0 floor 에 닿으려면 83.6/0.0462 ≈ 1810 일이 필요하다.
  // 반복이 그보다 짧으면(예: 200일) floor 클램프가 한 번도 작동하지 않아
  // 이 시나리오(경계 = 0 밑으로 안 내려감)를 실제로 검증하지 못한다 —
  // decay 지평을 넘기도록 2000일을 돈다.
  for (let day = 0; day < 2000; day += 1) {
    state = applyDailyRecord(state, {
      achievement: "full",
      focus: "good",
      tasks: [],
      studyHours: 0,
      virtualDayIndex: day % 7,
    });
    for (const key of ["idealSusi", "idealJungsi", "minSusi", "minJungsi"]) {
      expect(
        state[key] >= 0,
        `${key} 는 0 밑으로 내려가면 안 된다 (day ${day}: ${state[key]})`,
      ).toBeTruthy();
      expect(
        state[key] <= 100,
        `${key} 는 100 을 넘으면 안 된다 (day ${day}: ${state[key]})`,
      ).toBeTruthy();
    }
  }

  expect(state.idealSusi).toBe(0);
});

// ── 시나리오 5: 알려진 병리 — 목표 역전이 파이프라인 수준에서도 나타난다 ────

test("시나리오5 — 이상 목표 배율 < 최소 목표 배율이면 목표 학습시간이 역전된다(원본 동작, 고치지 않는다)", () => {
  // getStudyMultiplier: 이상=한밭대(목록 밖 기본값 0.46), 최소=서울대 의예과(0.90).
  // schedule.js:322-325 NOTE(target-parity) 가 예고한 병리를 파이프라인 수준에서 재현한다.
  const state = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 2.3,
    currentMogo: 60,
    lastNaesin: "1학기 중간",
    lastMogo: "3모",
    cuts: { idealNaesin: 1.5, idealJungsi: 70, minNaesin: 3.0, minJungsi: 60 },
    scheduleForm: makeScheduleForm({
      idealUniv: "한밭대학교",
      idealDept: "컴퓨터공학과",
      minUniv: "서울대학교",
      minDept: "의예과",
    }),
  });

  expect(
    state.weeklySchedule.monday!.ideal < state.weeklySchedule.monday!.min,
    `이상 목표(${state.weeklySchedule.monday!.ideal}h)가 최소 목표(${state.weeklySchedule.monday!.min}h)보다 커야 정상인데 역전됐다 — 원본 그대로다.`,
  ).toBeTruthy();
  expect(
    state.weekIdeal < state.weekMin,
    `weekIdeal(${state.weekIdeal})이 weekMin(${state.weekMin})보다 작게 역전돼야 한다.`,
  ).toBeTruthy();
});

// ── 시나리오 2-b: 게이지 캘리브레이션 — 배수 1.0일 때 정확히 D-day에 도달하는가 ──
//
// rate = (100 − 기준확률) / D-day일수 (bonus.js:129-134) 라는 정의는, 매일 배수가 전부
// 1.0이면 D-day에 정확히 100이 되도록 설계됐다는 뜻이다. 배수 1.0 조합(소스 근거):
//   - ACHIEVEMENT_MULTIPLIER.full = 1.0                          (bonus.js:27)
//   - FOCUS_MULTIPLIER.good = 1.0                                (bonus.js:38)
//   - getAchievementRateMultiplier(rate): rate>=100 이면 1.0     (bonus.js:148-152)
//     → studyHours === idealHours === minHours 로 두면 이상/최소 달성률이 둘 다
//       정확히 100%가 되어 이 분기에 들어간다.
//   - 과목 태그를 비워서 TASK_BONUS_MULTIPLIER(1.1) 를 안 태운다  (bonus.js:237-244)
// 네 조건을 동시에 만족하는 조합이 존재한다 — "1.0 조합 없음"은 해당하지 않는다.

test("시나리오2-b — 배수 1.0 조합으로 매일 기록하면 D-day 근방(±1일)에서 정확히 100%가 된다", () => {
  const now = new Date(2026, 8, 1); // 2026-09-01
  const { totalSusiDays, totalJungsiDays } = calcExpectedDDays("고3", now);
  // 원본 코드를 실행해서 뽑은 값(2026-09-01, 고3, 오프셋 0) — 손계산 아님.
  expect(totalSusiDays).toBe(11);
  expect(totalJungsiDays).toBe(79);

  const dayHours = 2; // ideal === min 이므로 달성률이 두 목표 모두 정확히 100%.
  const weeklySchedule = Object.fromEntries(
    VIRTUAL_DAY_NAMES.map((name) => [name, { ideal: dayHours, min: dayHours }]),
  );

  const initial = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 4.0,
    currentMogo: 50,
    lastNaesin: "1학기 중간",
    lastMogo: "3모",
    cuts: { idealNaesin: 1.5, idealJungsi: 80, minNaesin: 3.0, minJungsi: 60 },
    weeklySchedule,
    now,
  });

  const { reach } = runCalibratedLoop(initial, dayHours, totalJungsiDays + 10);

  // 실제 실행 결과(node --test 로 확인, 손계산 아님):
  //   idealSusi=11(=D-day 정확히), minSusi=12(+1일), idealJungsi=79(=D-day 정확히), minJungsi=80(+1일)
  // rate 자체가 round4Server 로 소수 4자리에서 반올림된 값이라(bonus.js:130-133),
  // (100-base)/D 가 딱 떨어지지 않으면 D일 누적합이 100에서 최대 0.0001×D 만큼 모자라거나
  // 남을 수 있다. 모자란 쪽은 clamp 문턱(100)을 못 넘어 다음 날 하루를 더 써야 한다.
  // NOTE(target-parity): 이건 원본 calcStudentBonusRates/calculateDailyBonus 조합 자체가
  // 가진 부동소수 반올림 특성이다 — 우리 조립이 만든 오차가 아니라 원본을 그대로 재현한 결과다.
  expect(
    reach.idealSusi,
    `idealSusi 는 D-day(${totalSusiDays})에 정확히 도달해야 한다`,
  ).toBe(totalSusiDays);
  expect(
    reach.idealJungsi,
    `idealJungsi 는 D-day(${totalJungsiDays})에 정확히 도달해야 한다`,
  ).toBe(totalJungsiDays);
  expect(
    reach.minSusi,
    `minSusi 는 round4 절삭 오차로 D-day+1(${totalSusiDays + 1})에 도달한다`,
  ).toBe(totalSusiDays + 1);
  expect(
    reach.minJungsi,
    `minJungsi 는 round4 절삭 오차로 D-day+1(${totalJungsiDays + 1})에 도달한다`,
  ).toBe(totalJungsiDays + 1);
});

test("시나리오2-b — 여러 기준확률/학년 조합에서도 배수 1.0 캘리브레이션은 D-day 또는 D-day+1일에만 도달한다(조기 도달 없음)", () => {
  const dayHours = 3;
  const weeklySchedule = Object.fromEntries(
    VIRTUAL_DAY_NAMES.map((name) => [name, { ideal: dayHours, min: dayHours }]),
  );

  const cases = [
    {
      grade: "고3",
      now: new Date(2026, 5, 20),
      cuts: {
        idealNaesin: 1.5,
        idealJungsi: 80,
        minNaesin: 3.0,
        minJungsi: 60,
      },
    },
    {
      grade: "고3",
      now: new Date(2026, 0, 15),
      cuts: {
        idealNaesin: 4.5,
        idealJungsi: 30,
        minNaesin: 6.0,
        minJungsi: 20,
      },
    },
    {
      grade: "고2",
      now: new Date(2026, 8, 1),
      cuts: {
        idealNaesin: 1.5,
        idealJungsi: 80,
        minNaesin: 3.0,
        minJungsi: 60,
      },
      convertedGrade: 3.0,
    },
  ];

  for (const c of cases) {
    const { totalSusiDays, totalJungsiDays } = calcExpectedDDays(
      c.grade,
      c.now,
    );
    const initial = buildInitialStudentState({
      schoolType: "일반고",
      grade: c.grade,
      currentScore: 4.0,
      currentMogo: 50,
      lastNaesin: "1학기 중간",
      lastMogo: "3모",
      cuts: c.cuts,
      weeklySchedule,
      now: c.now,
      // exactOptionalPropertyTypes: c 가 convertedGrade 를 안 가진 케이스도 있어
      // c.convertedGrade 는 number|undefined 다 — 명시적 undefined 할당 대신
      // 값이 있을 때만 키를 넣는다(런타임 동작은 동일: 없으면 함수 기본값 null 사용).
      ...(c.convertedGrade !== undefined
        ? { convertedGrade: c.convertedGrade }
        : {}),
    });

    const { reach } = runCalibratedLoop(
      initial,
      dayHours,
      totalJungsiDays + 20,
    );

    // 리터럴 배열이라 TS 가 [string, number][] 대신 (string|number)[][] 로 합쳐 추론한다
    // — 명시 타입을 달아 expectedBase 를 number 로 좁힌다(런타임엔 항상 number).
    const dDayPairs: [string, number][] = [
      ["idealSusi", totalSusiDays],
      ["minSusi", totalSusiDays],
      ["idealJungsi", totalJungsiDays],
      ["minJungsi", totalJungsiDays],
    ];
    for (const [key, expectedBase] of dDayPairs) {
      const delta = reach[key]! - expectedBase;
      expect(
        delta === 0 || delta === 1,
        `${c.grade}/${key}: D-day(${expectedBase}) 대비 오차가 0 또는 1이어야 하는데 ${delta}였다 ` +
          `(도달=${reach[key]}) — round4 반올림 방향에 따른 ±1일 밖의 오차는 캘리브레이션 붕괴를 뜻한다.`,
      ).toBeTruthy();
    }
  }
});

// ── 시나리오 2-c: 완벽 기록(배수 > 1.0)이면 D-day보다 며칠 일찍 도달하는가 ──

test("시나리오2-c — 최소 목표만 배수 1.2(달성률 200%)로 초과 달성하면 D-day보다 여러 날 일찍 100%에 도달한다", () => {
  const now = new Date(2026, 8, 1);
  const { totalSusiDays, totalJungsiDays } = calcExpectedDDays("고3", now);
  expect(totalSusiDays).toBe(11);
  expect(totalJungsiDays).toBe(79);

  // 이상 목표=2h, 최소 목표=1h. studyHours=2h 로 제출하면:
  //   이상 달성률 = 2/2*100 = 100%  → getAchievementRateMultiplier = 1.0 (bonus.js:151, 그대로)
  //   최소 달성률 = 2/1*100 = 200%  → getAchievementRateMultiplier = 1.2 (bonus.js:149, 170% 초과)
  const weeklySchedule = Object.fromEntries(
    VIRTUAL_DAY_NAMES.map((name) => [name, { ideal: 2, min: 1 }]),
  );

  const initial = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 4.0,
    currentMogo: 50,
    lastNaesin: "1학기 중간",
    lastMogo: "3모",
    cuts: { idealNaesin: 1.5, idealJungsi: 80, minNaesin: 3.0, minJungsi: 60 },
    weeklySchedule,
    now,
  });

  const { reach } = runCalibratedLoopFixedHours(
    initial,
    2,
    totalJungsiDays + 20,
  );

  // 이상 쪽은 달성률이 정확히 100%라 배수 1.0 그대로 — 시나리오2-b 와 동일하게 D-day(또는 +1)에 도달.
  expect(
    reach.idealSusi === totalSusiDays || reach.idealSusi === totalSusiDays + 1,
    `idealSusi 는 배수 1.0 이므로 D-day 근방이어야 한다 (기대 ${totalSusiDays}~${totalSusiDays + 1}, 실제 ${reach.idealSusi})`,
  ).toBeTruthy();
  expect(
    reach.idealJungsi === totalJungsiDays ||
      reach.idealJungsi === totalJungsiDays + 1,
    `idealJungsi 는 배수 1.0 이므로 D-day 근방이어야 한다 (기대 ${totalJungsiDays}~${totalJungsiDays + 1}, 실제 ${reach.idealJungsi})`,
  ).toBeTruthy();

  // 최소 쪽은 배수 1.2 라 D-day보다 일찍 도달해야 한다. 실행 결과(손계산 아님):
  //   minSusi 는 D-day(11)보다 1일 일찍(10일차), minJungsi 는 D-day(79)보다 13일 일찍(66일차) 도달했다.
  expect(
    reach.minSusi,
    `minSusi 조기도달 일수 불일치 (기대 ${totalSusiDays - 1}, 실제 ${reach.minSusi})`,
  ).toBe(totalSusiDays - 1);
  expect(
    reach.minJungsi,
    `minJungsi 조기도달 일수 불일치 (기대 ${totalJungsiDays - 13}, 실제 ${reach.minJungsi})`,
  ).toBe(totalJungsiDays - 13);

  expect(
    reach.minSusi! < totalSusiDays,
    "minSusi 는 D-day 보다 일찍 도달해야 한다",
  ).toBeTruthy();
  expect(
    reach.minJungsi! < totalJungsiDays,
    "minJungsi 는 D-day 보다 일찍 도달해야 한다(조기도달 폭이 더 크다 — rate 가 작을수록 배수 초과 효과가 누적 상대폭으로 더 크게 작용)",
  ).toBeTruthy();
});

// ── 4개 판정 헬퍼 골든 픽스처 (student.mjs 원본 그대로 실행해 뽑은 값) ──────

test("getConversionTypeForStudent — 골든 픽스처 (student.mjs:646-651)", () => {
  expect(getConversionTypeForStudent("초등학교", "초3")).toBe("elementary");
  expect(getConversionTypeForStudent("중학교", "고1")).toBe("middleschool"); // 학교급이 학년보다 우선 매칭
  expect(getConversionTypeForStudent("일반고", "중3")).toBe("middleschool"); // grade==='중3' 은 schoolType 무관하게 매칭
  expect(getConversionTypeForStudent("일반고", "고1")).toBe("5grade");
  expect(getConversionTypeForStudent("일반고", "고2")).toBe("5grade");
  expect(getConversionTypeForStudent("일반고", "고3")).toBe(""); // 고3은 변환 없음
  expect(getConversionTypeForStudent("일반고", "중1")).toBe(""); // 중1인데 schoolType 이 일반고면 미매칭(원본 그대로)
});

test("isMiddleStudent / isElementaryStudent / isPreHighStudent — 골든 픽스처 (student.mjs:679-702)", () => {
  expect(isMiddleStudent("중학교", "고1")).toBe(true);
  expect(isMiddleStudent("일반고", "중2")).toBe(true);
  expect(isMiddleStudent("일반고", "고1")).toBe(false);

  expect(isElementaryStudent("초등학교", "고1")).toBe(true);
  expect(isElementaryStudent("일반고", "초4")).toBe(true);
  expect(isElementaryStudent("일반고", "중1")).toBe(false);

  expect(isPreHighStudent("중학교", "고1")).toBe(true);
  expect(isPreHighStudent("초등학교", "고1")).toBe(true);
  expect(isPreHighStudent("일반고", "고3")).toBe(false);
});

// ── remainNaesin 오버라이드 우선순위 (DIVERGENCE.md #1) ──────────────────
//
// pipeline.js:219-237 수정: isPreHighStudent 인 학생도 remainingNaesin 오버라이드를
// 명시적으로 주면 그 값이 이제 0 강제를 이긴다. 오버라이드를 안 주는 기존 호출자는
// 동작이 완전히 같아야 한다(회귀 없음) — 그 보존을 이 블록에서 잠근다.

test("진짜 중학생(치환 아님) — remainingNaesin 오버라이드가 없으면 여전히 0이다(기존 동작 보존)", () => {
  const state = buildInitialStudentState({
    schoolType: "중학교",
    grade: "중2",
    currentScore: 5.0,
    convertedGrade: 5.0,
    cuts: { idealNaesin: 3.0, idealJungsi: 70, minNaesin: 5.0, minJungsi: 60 },
    weeklySchedule: { monday: { ideal: 1, min: 1 } },
  });
  expect(state.remainNaesin).toBe(0);
});

test("진짜 중학생(치환 아님) — remainingNaesin 오버라이드를 주면 그 값이 살아남는다(신규 동작)", () => {
  const state = buildInitialStudentState({
    schoolType: "중학교",
    grade: "중2",
    currentScore: 5.0,
    convertedGrade: 5.0,
    cuts: { idealNaesin: 3.0, idealJungsi: 70, minNaesin: 5.0, minJungsi: 60 },
    weeklySchedule: { monday: { ideal: 1, min: 1 } },
    remainingNaesin: 4,
  });
  expect(state.remainNaesin).toBe(4);
});

test('고1 무내신 특례("중3" 치환) — remainingNaesin 오버라이드가 없으면 여전히 0이다(기존 동작 보존)', () => {
  const state = buildInitialStudentState({
    schoolType: "일반고",
    grade: "중3", // intake.js 의 effectiveGrade 치환 리터럴
    currentScore: 3.0,
    convertedGrade: 3.0,
    cuts: { idealNaesin: 2.0, idealJungsi: 70, minNaesin: 4.0, minJungsi: 60 },
    weeklySchedule: { monday: { ideal: 1, min: 1 } },
  });
  expect(state.remainNaesin).toBe(0);
});

test('고1 무내신 특례("중3" 치환) — remainingNaesin 오버라이드를 주면 그 값이 살아남고 확률도 함께 낮아진다(핵심 수정)', () => {
  // convertedGrade=3.0 에 '중3' 페널티(+0.10)가 붙어 3.10 — cuts.idealNaesin(2.0)보다
  // 나쁜 등급이라 calcNaesinProb 의 "열세" 갈래를 탄다(primitives.js:126-129). 이 갈래는
  // 남은 시험이 있을수록 factor(<1)가 확률을 깎는다 — 그래서 오버라이드가 적용되면
  // (불확실성이 실제로 있으면) 확률이 "성적 확정" 취급(remainExams=0)보다 낮아져야
  // 정상이다. 원본 결함은 정확히 반대였다(불확실한 쪽이 더 높았다).
  const convertedGrade = applyPreHighGradePenalty("일반고", "중3", 3.0);
  const cuts = {
    idealNaesin: 2.0,
    idealJungsi: 70,
    minNaesin: 4.0,
    minJungsi: 60,
  };
  const weeklySchedule = { monday: { ideal: 1, min: 1 } };

  const withoutOverride = buildInitialStudentState({
    schoolType: "일반고",
    grade: "중3",
    currentScore: 3.0,
    convertedGrade: 3.0,
    cuts,
    weeklySchedule,
  });
  const withOverride = buildInitialStudentState({
    schoolType: "일반고",
    grade: "중3",
    currentScore: 3.0,
    convertedGrade: 3.0,
    cuts,
    weeklySchedule,
    remainingNaesin: 6,
  });

  expect(withoutOverride.remainNaesin).toBe(0);
  expect(withOverride.remainNaesin).toBe(6);

  // 기대값은 손계산이 아니라 primitives.js 의 실제 calcNaesinProb 을 독립적으로 실행해 구한다.
  expect(withoutOverride.idealSusi).toBe(
    calcNaesinProb(convertedGrade, cuts.idealNaesin, 0, 10),
  );
  expect(withOverride.idealSusi).toBe(
    calcNaesinProb(convertedGrade, cuts.idealNaesin, 6, 10),
  );

  expect(
    withOverride.idealSusi < withoutOverride.idealSusi,
    `오버라이드로 남은 시험이 반영되면(불확실성 있음) "성적 확정" 취급보다 확률이 낮아야 한다 ` +
      `(오버라이드 없음=${withoutOverride.idealSusi}, 오버라이드 있음=${withOverride.idealSusi})`,
  ).toBeTruthy();
});

test("고2 — remainingNaesin 오버라이드 경로는 이번 수정으로 변화가 없다(회귀 방지)", () => {
  const state = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고2",
    currentScore: 3.0,
    convertedGrade: 3.0,
    cuts: { idealNaesin: 2.0, idealJungsi: 70, minNaesin: 4.0, minJungsi: 60 },
    weeklySchedule: { monday: { ideal: 1, min: 1 } },
    remainingNaesin: 6,
  });
  // 고2 는 isPreHighStudent 가 애초에 false 라 이번 가드 변경의 영향권 밖이다.
  expect(state.remainNaesin).toBe(6);
});

test("고3 — remainingNaesin 오버라이드 경로는 이번 수정으로 변화가 없다(회귀 방지)", () => {
  const state = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 3.0,
    cuts: { idealNaesin: 2.0, idealJungsi: 70, minNaesin: 4.0, minJungsi: 60 },
    weeklySchedule: { monday: { ideal: 1, min: 1 } },
    remainingNaesin: 2,
  });
  expect(state.remainNaesin).toBe(2);
});

// ── 시나리오 6: 일요일 구멍 — 미이식 getSundayRemainingScheduleFromRecords 자리의 현재 동작 ──

test("시나리오6 — weeklySchedule 에 일요일이 없고 0시간 제출이면 감점하지 않는다(기본값 {ideal:0,min:0} 폴백)", () => {
  const weeklySchedule = {
    monday: { ideal: 3, min: 1.5 },
    tuesday: { ideal: 3, min: 1.5 },
    wednesday: { ideal: 3, min: 1.5 },
    thursday: { ideal: 3, min: 1.5 },
    friday: { ideal: 3, min: 1.5 },
    saturday: { ideal: 3, min: 1.5 },
    // sunday 키 자체가 없음 — 원본의 getSundayRemainingScheduleFromRecords 미이식.
  };

  const initial = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 3.5,
    currentMogo: 55,
    lastNaesin: "1학기 중간",
    lastMogo: "3모",
    cuts: { idealNaesin: 1.5, idealJungsi: 80, minNaesin: 3.0, minJungsi: 60 },
    weeklySchedule,
  });

  const after = applyDailyRecord(initial, {
    achievement: "full",
    focus: "good",
    tasks: [],
    studyHours: 0,
    virtualDayIndex: 6, // sunday — weeklySchedule.sunday 없음 → {ideal:0,min:0} 폴백
  });

  expect(after.idealSusi).toBe(initial.idealSusi);
  expect(after.idealJungsi).toBe(initial.idealJungsi);
  expect(after.minSusi).toBe(initial.minSusi);
  expect(after.minJungsi).toBe(initial.minJungsi);
});

test('시나리오6 — 구멍: weeklySchedule 에 일요일이 없는데 양수 시간을 제출하면 "목표 없음"이 "목표 100% 달성"으로 취급돼 정상 증분을 받는다', () => {
  // bonus.js:224-226 "목표 시간이 0 이하면 달성률을 100%로 간주한다(분모 0 회피)".
  // 원본의 일요일 보충(getSundayRemainingScheduleFromRecords)을 이식하지 않았기 때문에,
  // 이 파이프라인에서 일요일 목표를 안 채워주면 위 규칙이 그대로 적용돼 "목표가 없다"가
  // 아니라 "이미 목표를 다 채웠다"처럼 동작한다 — 의도한 동작이 아니라 미이식의 부작용이다.
  // record.idealHours/record.minHours 를 직접 주입하지 않는 한 이 구멍은 항상 열려 있다.
  const weeklySchedule = {
    monday: { ideal: 3, min: 1.5 },
    tuesday: { ideal: 3, min: 1.5 },
    wednesday: { ideal: 3, min: 1.5 },
    thursday: { ideal: 3, min: 1.5 },
    friday: { ideal: 3, min: 1.5 },
    saturday: { ideal: 3, min: 1.5 },
    // sunday 없음
  };

  const initial = buildInitialStudentState({
    schoolType: "일반고",
    grade: "고3",
    currentScore: 3.5,
    currentMogo: 55,
    lastNaesin: "1학기 중간",
    lastMogo: "3모",
    cuts: { idealNaesin: 1.5, idealJungsi: 80, minNaesin: 3.0, minJungsi: 60 },
    weeklySchedule,
  });

  const after = applyDailyRecord(initial, {
    achievement: "full",
    focus: "good",
    tasks: [],
    studyHours: 2, // 목표(0)와 무관하게 아무 양수나 제출
    virtualDayIndex: 6,
  });

  // achMult(full)=1.0 × focMult(good)=1.0 × iRateMult(목표<=0→100%로 간주)=1.0 → rate 전액 그대로.
  expect(after.cumulativeBonus.idealSusi).toBe(initial.rates.idealSusiBonus);
  expect(after.cumulativeBonus.idealJungsi).toBe(
    initial.rates.idealJungsiBonus,
  );
  expect(after.cumulativeBonus.minSusi).toBe(initial.rates.minSusiBonus);
  expect(after.cumulativeBonus.minJungsi).toBe(initial.rates.minJungsiBonus);
  expect(
    after.idealSusi > initial.idealSusi,
    "구멍 재현: 목표 미설정 일요일 제출이 실제로 확률을 올린다",
  ).toBeTruthy();

  // record.idealHours/minHours 를 직접 주입하면 이 구멍을 피할 수 있다(정상 동작 확인).
  const withOverride = applyDailyRecord(initial, {
    achievement: "full",
    focus: "good",
    tasks: [],
    studyHours: 0,
    virtualDayIndex: 6,
    idealHours: 0,
    minHours: 0,
  });
  expect(
    withOverride.idealSusi,
    "호출자가 명시적으로 0/0 을 주입하면 무감점(zeroBonus) 분기를 탄다",
  ).toBe(initial.idealSusi);
});
