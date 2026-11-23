// src/lib/goal/calc/bonus.js 골든 픽스처 회귀 테스트.
//
// 생성 방법: 원본 소스를 글자 그대로 잘라 실행해 기대값을 뽑았다(손계산 금지).
//   - target/api/student.mjs:239-245 (round1/round4) + target/api/student.mjs:404-442 (calcStudentBonusRates)
//   - target/App.tsx:22-27 + target/App.tsx:33-40 + target/App.tsx:42-94
// 하네스는 위 구간을 그대로 복사(타입 주석만 제거)한 뒤, calcStudentBonusRates 가 내부에서
// 호출하는 new Date() 를 무인자 생성 시 고정 시각을 돌려주는 Date 서브클래스로 갈아끼워 실행했다.
// 실행 커맨드: TZ=Asia/Seoul node harness.mjs
//
// 아래 EXPECTED_* 배열은 그 실행 출력 그대로다. 손으로 고치지 말 것 —
// 값이 바뀌어야 한다면 원본을 다시 실행해 재생성해야 한다.

// calcStudentBonusRates 의 D-day 계산은 로컬 타임존에 의존한다(원본 그대로). 픽스처는 KST 기준으로
// 뽑았으므로 실행 타임존을 고정한다. DST 가 있는 타임존(America/New_York 등)에서는 ceil 때문에
// 결과가 하루 달라지는 것을 실측 확인했다. import 는 호이스팅되지만 대상 모듈이 로드 시점에
// Date 를 만들지 않으므로 이 위치에서 지정해도 안전하다.
process.env.TZ = "Asia/Seoul";

import { expect, test } from "vitest";

import {
  ACHIEVEMENT_MULTIPLIER,
  calcStudentBonusRates,
  calculateDailyBonus,
  FOCUS_MULTIPLIER,
  getAchievementRateMultiplier,
  TASK_BONUS_MULTIPLIER,
  TASK_MOCK_EXAM,
  TASK_NAESIN,
} from "./bonus.ts";

// 부동소수 비교. NaN 은 NaN 끼리 같은 것으로 본다(원본이 NaN 을 그대로 흘리는 경로가 있다).
function assertClose(actual, expected, label) {
  if (Number.isNaN(expected)) {
    expect(
      Number.isNaN(actual),
      `${label}: NaN 기대, 실제 ${actual}`,
    ).toBeTruthy();
    return;
  }
  expect(
    Math.abs(actual - expected) < 1e-9,
    `${label}: 기대 ${expected}, 실제 ${actual}`,
  ).toBeTruthy();
}

function assertBonusEqual(actual, expected, label) {
  expect(Object.keys(actual).sort(), `${label}: 반환 키 집합 불일치`).toEqual(
    Object.keys(expected).sort(),
  );
  for (const key of Object.keys(expected)) {
    assertClose(actual[key], expected[key], `${label}.${key}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 배수 상수
// ─────────────────────────────────────────────────────────────

test("배수 상수는 원본 값 그대로다", () => {
  expect(ACHIEVEMENT_MULTIPLIER).toEqual({
    full: 1.0,
    high: 0.9,
    mid: 0.7,
    low: 0.4,
    none: 0.1,
  });
  expect(FOCUS_MULTIPLIER).toEqual({
    excellent: 1.1,
    good: 1.0,
    normal: 0.9,
    low: 0.7,
    veryLow: 0.5,
  });
  expect(TASK_BONUS_MULTIPLIER).toBe(1.1);
  expect(TASK_NAESIN).toBe("내신 과목");
  expect(TASK_MOCK_EXAM).toBe("기출/모의고사");
});

// ─────────────────────────────────────────────────────────────
// calcStudentBonusRates
// ─────────────────────────────────────────────────────────────

// 학년 12단. 고3=0 오프셋부터 초1=4015 까지.
const GRADES = [
  "고3",
  "고2",
  "고1",
  "중3",
  "중2",
  "중1",
  "초6",
  "초5",
  "초4",
  "초3",
  "초2",
  "초1",
];

// [연, 월(0-base), 일, 시, 분, 초, ms] — 기준일 전후/당일 경계를 포함한다.
// Date 생성자에 스프레드하므로 튜플로 문맥 타입 지정한다(순수 타입 지정, 값 불변).
const NOWS: [number, number, number, number, number, number, number][] = [
  [2026, 0, 1, 0, 0, 0, 0],
  [2026, 7, 11, 13, 47, 22, 123], // 평범한 오후
  [2026, 8, 11, 0, 0, 0, 0], // 수시 기준일 하루 전 → D-1
  [2026, 8, 12, 0, 0, 0, 0], // 수시 기준일 당일 (susiBase <= now → 내년으로 밀림)
  [2026, 8, 12, 23, 59, 59, 999], // 수시 기준일 당일 늦은 시각
  [2026, 8, 13, 0, 0, 0, 0], // 수시 기준일 다음날
  [2026, 10, 18, 9, 0, 0, 0], // 정시 기준일 하루 전 → D-1
  [2026, 10, 19, 9, 0, 0, 0], // 정시 기준일 당일
  [2026, 10, 20, 9, 0, 0, 0], // 정시 기준일 다음날
  [2026, 11, 31, 23, 0, 0, 0], // 연말
  [2027, 1, 28, 12, 0, 0, 0], // 평년 2/28
  [2028, 1, 29, 12, 0, 0, 0], // 윤년 2/29
];

// calcStudentBonusRates 에 스프레드하므로 튜플로 문맥 타입 지정한다(순수 타입 지정, 값 불변).
const BASE_PROBS: [number, number, number, number] = [72.5, 41.3, 88.1, 60];

// 기준확률 경계·비정상 입력 (now 는 2026-08-11 고정, 학년 고3)
const PROB_SETS = [
  [0, 0, 0, 0],
  [100, 100, 100, 100], // 분자 0
  [120, 150, 101, 100.5], // 100 초과 → rate 음수
  [-10, -0.5, -100, -1], // 음수 확률
  [null, undefined, NaN, "abc"], // 비정상 입력
  [50, 0, 100, -20],
];

// 미지 학년 → 오프셋 0 fallback
const UNKNOWN_GRADES = [null, undefined, "", "유치원", "고3 ", "N수"];

const EXPECTED_CSBR = [
  /* 0 */ {
    idealSusiBonus: 0.1083,
    idealJungsiBonus: 0.1823,
    minSusiBonus: 0.0469,
    minJungsiBonus: 0.1242,
  },
  /* 1 */ {
    idealSusiBonus: 0.8594,
    idealJungsiBonus: 0.587,
    minSusiBonus: 0.3719,
    minJungsiBonus: 0.4,
  },
  /* 2 */ {
    idealSusiBonus: 0.0693,
    idealJungsiBonus: 0.1262,
    minSusiBonus: 0.03,
    minJungsiBonus: 0.086,
  },
  /* 3 */ {
    idealSusiBonus: 0.0361,
    idealJungsiBonus: 0.0707,
    minSusiBonus: 0.0156,
    minJungsiBonus: 0.0482,
  },
  /* 4 */ {
    idealSusiBonus: 0.0244,
    idealJungsiBonus: 0.0491,
    minSusiBonus: 0.0106,
    minJungsiBonus: 0.0335,
  },
  /* 5 */ {
    idealSusiBonus: 0.0184,
    idealJungsiBonus: 0.0376,
    minSusiBonus: 0.008,
    minJungsiBonus: 0.0256,
  },
  /* 6 */ {
    idealSusiBonus: 0.0148,
    idealJungsiBonus: 0.0305,
    minSusiBonus: 0.0064,
    minJungsiBonus: 0.0208,
  },
  /* 7 */ {
    idealSusiBonus: 0.0124,
    idealJungsiBonus: 0.0256,
    minSusiBonus: 0.0054,
    minJungsiBonus: 0.0175,
  },
  /* 8 */ {
    idealSusiBonus: 0.0106,
    idealJungsiBonus: 0.0221,
    minSusiBonus: 0.0046,
    minJungsiBonus: 0.0151,
  },
  /* 9 */ {
    idealSusiBonus: 0.0093,
    idealJungsiBonus: 0.0194,
    minSusiBonus: 0.004,
    minJungsiBonus: 0.0132,
  },
  /* 10 */ {
    idealSusiBonus: 0.0083,
    idealJungsiBonus: 0.0173,
    minSusiBonus: 0.0036,
    minJungsiBonus: 0.0118,
  },
  /* 11 */ {
    idealSusiBonus: 0.0075,
    idealJungsiBonus: 0.0157,
    minSusiBonus: 0.0032,
    minJungsiBonus: 0.0107,
  },
  /* 12 */ {
    idealSusiBonus: 0.0068,
    idealJungsiBonus: 0.0143,
    minSusiBonus: 0.0029,
    minJungsiBonus: 0.0097,
  },
  /* 13 */ {
    idealSusiBonus: 27.5,
    idealJungsiBonus: 0.8507,
    minSusiBonus: 11.9,
    minJungsiBonus: 0.5797,
  },
  /* 14 */ {
    idealSusiBonus: 0.0753,
    idealJungsiBonus: 0.8632,
    minSusiBonus: 0.0326,
    minJungsiBonus: 0.5882,
  },
  /* 15 */ {
    idealSusiBonus: 0.0377,
    idealJungsiBonus: 0.1356,
    minSusiBonus: 0.0163,
    minJungsiBonus: 0.0924,
  },
  /* 16 */ {
    idealSusiBonus: 0.0251,
    idealJungsiBonus: 0.0736,
    minSusiBonus: 0.0109,
    minJungsiBonus: 0.0501,
  },
  /* 17 */ {
    idealSusiBonus: 0.0188,
    idealJungsiBonus: 0.0505,
    minSusiBonus: 0.0082,
    minJungsiBonus: 0.0344,
  },
  /* 18 */ {
    idealSusiBonus: 0.0151,
    idealJungsiBonus: 0.0384,
    minSusiBonus: 0.0065,
    minJungsiBonus: 0.0262,
  },
  /* 19 */ {
    idealSusiBonus: 0.0126,
    idealJungsiBonus: 0.031,
    minSusiBonus: 0.0054,
    minJungsiBonus: 0.0211,
  },
  /* 20 */ {
    idealSusiBonus: 0.0108,
    idealJungsiBonus: 0.026,
    minSusiBonus: 0.0047,
    minJungsiBonus: 0.0177,
  },
  /* 21 */ {
    idealSusiBonus: 0.0094,
    idealJungsiBonus: 0.0224,
    minSusiBonus: 0.0041,
    minJungsiBonus: 0.0152,
  },
  /* 22 */ {
    idealSusiBonus: 0.0084,
    idealJungsiBonus: 0.0196,
    minSusiBonus: 0.0036,
    minJungsiBonus: 0.0134,
  },
  /* 23 */ {
    idealSusiBonus: 0.0075,
    idealJungsiBonus: 0.0175,
    minSusiBonus: 0.0033,
    minJungsiBonus: 0.0119,
  },
  /* 24 */ {
    idealSusiBonus: 0.0068,
    idealJungsiBonus: 0.0158,
    minSusiBonus: 0.003,
    minJungsiBonus: 0.0108,
  },
  /* 25 */ {
    idealSusiBonus: 0.0063,
    idealJungsiBonus: 0.0144,
    minSusiBonus: 0.0027,
    minJungsiBonus: 0.0098,
  },
  /* 26 */ {
    idealSusiBonus: 0.0753,
    idealJungsiBonus: 0.8632,
    minSusiBonus: 0.0326,
    minJungsiBonus: 0.5882,
  },
  /* 27 */ {
    idealSusiBonus: 0.0755,
    idealJungsiBonus: 0.8761,
    minSusiBonus: 0.0327,
    minJungsiBonus: 0.597,
  },
  /* 28 */ {
    idealSusiBonus: 0.0923,
    idealJungsiBonus: 58.7,
    minSusiBonus: 0.0399,
    minJungsiBonus: 40,
  },
  /* 29 */ {
    idealSusiBonus: 0.0926,
    idealJungsiBonus: 0.1608,
    minSusiBonus: 0.0401,
    minJungsiBonus: 0.1096,
  },
  /* 30 */ {
    idealSusiBonus: 0.0929,
    idealJungsiBonus: 0.1613,
    minSusiBonus: 0.0402,
    minJungsiBonus: 0.1099,
  },
  /* 31 */ {
    idealSusiBonus: 0.1078,
    idealJungsiBonus: 0.1817,
    minSusiBonus: 0.0467,
    minJungsiBonus: 0.1238,
  },
  /* 32 */ {
    idealSusiBonus: 0.1403,
    idealJungsiBonus: 0.2223,
    minSusiBonus: 0.0607,
    minJungsiBonus: 0.1515,
  },
  /* 33 */ {
    idealSusiBonus: 0.1403,
    idealJungsiBonus: 0.2223,
    minSusiBonus: 0.0607,
    minJungsiBonus: 0.1515,
  },
  /* 34 */ {
    idealSusiBonus: 3.125,
    idealJungsiBonus: 1,
    minSusiBonus: 3.125,
    minJungsiBonus: 1,
  },
  /* 35 */ {
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
  },
  /* 36 */ {
    idealSusiBonus: -0.625,
    idealJungsiBonus: -0.5,
    minSusiBonus: -0.0312,
    minJungsiBonus: -0.005,
  },
  /* 37 */ {
    idealSusiBonus: 3.4375,
    idealJungsiBonus: 1.005,
    minSusiBonus: 6.25,
    minJungsiBonus: 1.01,
  },
  /* 38 */ {
    idealSusiBonus: 3.125,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
  },
  /* 39 */ {
    idealSusiBonus: 1.5625,
    idealJungsiBonus: 1,
    minSusiBonus: 0,
    minJungsiBonus: 1.2,
  },
  /* 40 */ {
    idealSusiBonus: 0.8594,
    idealJungsiBonus: 0.587,
    minSusiBonus: 0.3719,
    minJungsiBonus: 0.4,
  },
  /* 41 */ {
    idealSusiBonus: 0.8594,
    idealJungsiBonus: 0.587,
    minSusiBonus: 0.3719,
    minJungsiBonus: 0.4,
  },
  /* 42 */ {
    idealSusiBonus: 0.8594,
    idealJungsiBonus: 0.587,
    minSusiBonus: 0.3719,
    minJungsiBonus: 0.4,
  },
  /* 43 */ {
    idealSusiBonus: 0.8594,
    idealJungsiBonus: 0.587,
    minSusiBonus: 0.3719,
    minJungsiBonus: 0.4,
  },
  /* 44 */ {
    idealSusiBonus: 0.8594,
    idealJungsiBonus: 0.587,
    minSusiBonus: 0.3719,
    minJungsiBonus: 0.4,
  },
  /* 45 */ {
    idealSusiBonus: 0.8594,
    idealJungsiBonus: 0.587,
    minSusiBonus: 0.3719,
    minJungsiBonus: 0.4,
  },
];

test("calcStudentBonusRates: 골든 픽스처", () => {
  let i = 0;
  const check = (label, result) => {
    assertBonusEqual(result, EXPECTED_CSBR[i], `[${i}] ${label}`);
    i += 1;
  };

  for (const [n, nowParts] of NOWS.entries()) {
    // 학년 12단 전수는 대표 시점 2개에서만 돌린다(나머지 시점은 고3).
    const grades = n === 1 || n === 3 ? GRADES : ["고3"];
    for (const grade of grades) {
      const now = new Date(...nowParts);
      check(
        `now=${nowParts.join("-")} grade=${grade}`,
        calcStudentBonusRates(grade, ...BASE_PROBS, now),
      );
    }
  }

  for (const probs of PROB_SETS) {
    check(
      `probs=${String(probs)}`,
      // PROB_SETS 는 방어 케이스라 null/undefined/문자열("abc")도 섞여 있고
      // calcStudentBonusRates 시그니처(확률 4개: number)와 다르므로 캐스팅만 한다.
      calcStudentBonusRates(
        "고3",
        ...(probs as [number, number, number, number]),
        new Date(2026, 7, 11, 0, 0, 0, 0),
      ),
    );
  }

  for (const grade of UNKNOWN_GRADES) {
    check(
      `unknown grade=${String(grade)}`,
      calcStudentBonusRates(
        grade as string,
        ...BASE_PROBS,
        new Date(2026, 7, 11, 0, 0, 0, 0),
      ),
    );
  }

  expect(i, "픽스처 개수와 실행 횟수가 다르다").toBe(EXPECTED_CSBR.length);
});

test("calcStudentBonusRates: 주입한 Date 를 변형하지 않는다 (원본 대비 의도적 개선)", () => {
  const now = new Date(2026, 7, 11, 13, 47, 22, 123);
  const before = now.getTime();
  calcStudentBonusRates("고3", ...BASE_PROBS, now);
  expect(now.getTime(), "인자로 받은 Date 가 자정으로 변형됐다").toBe(before);
});

test("calcStudentBonusRates: now 기본값은 현재 시각이다", () => {
  const injected = calcStudentBonusRates("고3", ...BASE_PROBS, new Date());
  const defaulted = calcStudentBonusRates("고3", ...BASE_PROBS);
  expect(defaulted).toEqual(injected);
});

test("calcStudentBonusRates: 기준일 당일은 이미 지난 것으로 보고 내년으로 넘긴다", () => {
  const dayBefore = calcStudentBonusRates(
    "고3",
    0,
    0,
    0,
    0,
    new Date(2026, 8, 11),
  );
  const sameDay = calcStudentBonusRates(
    "고3",
    0,
    0,
    0,
    0,
    new Date(2026, 8, 12),
  );
  // D-1 이면 100/1 = 100, 당일이면 100/365 로 급락한다.
  assertClose(dayBefore.idealSusiBonus, 100, "D-1 수시");
  assertClose(sameDay.idealSusiBonus, 0.274, "당일 수시");
});

test("calcStudentBonusRates: 학년 오프셋은 365일 등차 12단이다", () => {
  // 2026-08-11 → 2026-09-12 까지 32일. 고3은 오프셋 0이므로 총 일수 = 32 + 365*단계.
  const now = new Date(2026, 7, 11);
  const baseDays = 32;
  GRADES.forEach((g, idx) => {
    const expected = Math.round((100 / (baseDays + 365 * idx)) * 10000) / 10000;
    assertClose(
      calcStudentBonusRates(g, 0, 0, 0, 0, now).idealSusiBonus,
      expected,
      `${g} 오프셋(${365 * idx})`,
    );
  });
  expect(365 * 11, "초1 오프셋은 4015").toBe(4015);
});

// ─────────────────────────────────────────────────────────────
// getAchievementRateMultiplier
// ─────────────────────────────────────────────────────────────

// [입력 달성률(%), 기대 배수]
const EXPECTED_GARM: [number, number][] = [
  [-100, 0],
  [-1, 0],
  [-0.0001, 0],
  [0, 0],
  [0.5, 0.005],
  [1, 0.01],
  [33.3333, 0.333333],
  [50, 0.5],
  [99, 0.99],
  [99.9999, 0.999999],
  [100, 1],
  [100.0001, 1],
  [110, 1],
  [129.9999, 1],
  [130, 1],
  [130.0001, 1.1],
  [150, 1.1],
  [169.9999, 1.1],
  [170, 1.1],
  [170.0001, 1.2],
  [200, 1.2],
  [1000, 1.2],
  [NaN, NaN],
  [Infinity, 1.2],
  [-Infinity, 0],
];

test("getAchievementRateMultiplier: 골든 픽스처", () => {
  for (const [rate, expected] of EXPECTED_GARM) {
    assertClose(getAchievementRateMultiplier(rate), expected, `rate=${rate}`);
  }
});

test("getAchievementRateMultiplier: 부등호 방향(130·170 은 초과, 100 은 이상)", () => {
  // 경계값 자체는 아래 구간에 속한다 — 원본 그대로.
  expect(getAchievementRateMultiplier(130)).toBe(1.0);
  expect(getAchievementRateMultiplier(170)).toBe(1.1);
  expect(getAchievementRateMultiplier(100)).toBe(1.0);
});

// ─────────────────────────────────────────────────────────────
// calculateDailyBonus
// ─────────────────────────────────────────────────────────────

// 대표 rate 4종 (이상수시, 이상정시, 최소수시, 최소정시)
const R = [0.0123, 0.0456, 0.0198, 0.0321];

// [성취도, 집중도, rate 4종, tasks, 학습시간, 이상목표시간, 최소목표시간]
// 열마다 문자열/숫자/null/undefined 가 섞여 있어 명시 타입 없이는 TS 가 전체를 하나의
// 합집합으로 뭉쳐 추론한다 — 튜플로 문맥 타입 지정한다(순수 타입 지정, 값 불변).
const CDB_CASES: [
  string | undefined,
  string | undefined,
  number[],
  string[],
  number,
  number | string | null | undefined,
  number | string | null | undefined,
][] = [
  ["full", "excellent", R, [], 8, 8, 5],
  ["full", "excellent", R, ["내신 과목"], 8, 8, 5],
  ["full", "excellent", R, ["기출/모의고사"], 8, 8, 5],
  ["full", "excellent", R, ["내신 과목", "기출/모의고사"], 8, 8, 5],
  ["full", "excellent", R, ["개념 학습", "기타"], 8, 8, 5],
  ["high", "good", R, [], 8, 8, 5],
  ["mid", "normal", R, [], 8, 8, 5],
  ["low", "low", R, [], 8, 8, 5],
  ["none", "veryLow", R, [], 8, 8, 5],
  ["미지값", "good", R, [], 8, 8, 5], // 성취도 미지값 → 0배
  ["full", "미지값", R, [], 8, 8, 5], // 집중도 미지값 → 1배
  [undefined, undefined, R, [], 8, 8, 5],
  // 0시간 제출
  ["full", "excellent", R, [], 0, 8, 5], // 감점
  ["full", "excellent", R, ["내신 과목"], 0, 8, 5],
  ["full", "excellent", R, [], 0, 0, 0], // 목표도 0 → zeroBonus
  ["full", "excellent", R, [], 0, 0, 5], // 최소 목표만 있음 → 감점
  ["full", "excellent", R, [], 0, 8, 0],
  ["full", "excellent", R, [], 0, null, null],
  ["full", "excellent", R, [], 0, undefined, undefined],
  ["full", "excellent", R, [], 0, -1, -1], // 음수 목표 <= 0 → zeroBonus
  // 목표 시간 0 (분모 0 회피 경로)
  ["full", "good", R, [], 5, 0, 0],
  ["full", "good", R, [], 5, 0, 5],
  // 달성률 경계
  ["full", "good", R, [], 10, 10, 10], // 100%
  ["full", "good", R, [], 13, 10, 10], // 130% 정확
  ["full", "good", R, [], 13.1, 10, 10], // 131%
  ["full", "good", R, [], 17, 10, 10], // 170% 정확
  ["full", "good", R, [], 17.1, 10, 10], // 171%
  ["full", "good", R, [], 9.99, 10, 10], // 99.9%
  ["full", "good", R, [], 1, 10, 10], // 10%
  ["full", "good", R, [], 0.001, 10, 10],
  ["full", "good", R, [], 20, 10, 4], // 이상 200% / 최소 500%
  // 음수 시간 (studyHours === 0 이 아니므로 정상 분기)
  ["full", "good", R, [], -3, 10, 5],
  // 음수 rate (기준확률 100 초과인 학생)
  ["full", "good", [-0.01, -0.02, -0.03, -0.04], [], 8, 8, 5],
  ["full", "good", [-0.01, -0.02, -0.03, -0.04], [], 0, 8, 5],
  // rate 0
  ["full", "good", [0, 0, 0, 0], [], 8, 8, 5],
  ["full", "good", [0, 0, 0, 0], [], 0, 8, 5],
  // 문자열 시간 (Number 변환 경로)
  ["full", "good", R, [], 8, "8", "5"],
  ["full", "good", R, [], 8, "abc", "abc"], // Number('abc') → NaN → 목표 0 취급
];

const EXPECTED_CDB = [
  /* 0 */ {
    calculatedBonus: 0.0135,
    idealSusiBonus: 0.0135,
    idealJungsiBonus: 0.0502,
    minSusiBonus: 0.024,
    minJungsiBonus: 0.0388,
    susiBonus: 0.0135,
    jungsiBonus: 0.0502,
  },
  /* 1 */ {
    calculatedBonus: 0.0149,
    idealSusiBonus: 0.0149,
    idealJungsiBonus: 0.0502,
    minSusiBonus: 0.0264,
    minJungsiBonus: 0.0388,
    susiBonus: 0.0149,
    jungsiBonus: 0.0502,
  },
  /* 2 */ {
    calculatedBonus: 0.0135,
    idealSusiBonus: 0.0135,
    idealJungsiBonus: 0.0552,
    minSusiBonus: 0.024,
    minJungsiBonus: 0.0427,
    susiBonus: 0.0135,
    jungsiBonus: 0.0552,
  },
  /* 3 */ {
    calculatedBonus: 0.0149,
    idealSusiBonus: 0.0149,
    idealJungsiBonus: 0.0552,
    minSusiBonus: 0.0264,
    minJungsiBonus: 0.0427,
    susiBonus: 0.0149,
    jungsiBonus: 0.0552,
  },
  /* 4 */ {
    calculatedBonus: 0.0135,
    idealSusiBonus: 0.0135,
    idealJungsiBonus: 0.0502,
    minSusiBonus: 0.024,
    minJungsiBonus: 0.0388,
    susiBonus: 0.0135,
    jungsiBonus: 0.0502,
  },
  /* 5 */ {
    calculatedBonus: 0.0111,
    idealSusiBonus: 0.0111,
    idealJungsiBonus: 0.041,
    minSusiBonus: 0.0196,
    minJungsiBonus: 0.0318,
    susiBonus: 0.0111,
    jungsiBonus: 0.041,
  },
  /* 6 */ {
    calculatedBonus: 0.0077,
    idealSusiBonus: 0.0077,
    idealJungsiBonus: 0.0287,
    minSusiBonus: 0.0137,
    minJungsiBonus: 0.0222,
    susiBonus: 0.0077,
    jungsiBonus: 0.0287,
  },
  /* 7 */ {
    calculatedBonus: 0.0034,
    idealSusiBonus: 0.0034,
    idealJungsiBonus: 0.0128,
    minSusiBonus: 0.0061,
    minJungsiBonus: 0.0099,
    susiBonus: 0.0034,
    jungsiBonus: 0.0128,
  },
  /* 8 */ {
    calculatedBonus: 0.0006,
    idealSusiBonus: 0.0006,
    idealJungsiBonus: 0.0023,
    minSusiBonus: 0.0011,
    minJungsiBonus: 0.0018,
    susiBonus: 0.0006,
    jungsiBonus: 0.0023,
  },
  /* 9 */ {
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  },
  /* 10 */ {
    calculatedBonus: 0.0123,
    idealSusiBonus: 0.0123,
    idealJungsiBonus: 0.0456,
    minSusiBonus: 0.0218,
    minJungsiBonus: 0.0353,
    susiBonus: 0.0123,
    jungsiBonus: 0.0456,
  },
  /* 11 */ {
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  },
  /* 12 */ {
    calculatedBonus: -0.0123,
    idealSusiBonus: -0.0123,
    idealJungsiBonus: -0.0456,
    minSusiBonus: -0.0198,
    minJungsiBonus: -0.0321,
    susiBonus: -0.0123,
    jungsiBonus: -0.0456,
  },
  /* 13 */ {
    calculatedBonus: -0.0123,
    idealSusiBonus: -0.0123,
    idealJungsiBonus: -0.0456,
    minSusiBonus: -0.0198,
    minJungsiBonus: -0.0321,
    susiBonus: -0.0123,
    jungsiBonus: -0.0456,
  },
  /* 14 */ {
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  },
  /* 15 */ {
    calculatedBonus: -0.0123,
    idealSusiBonus: -0.0123,
    idealJungsiBonus: -0.0456,
    minSusiBonus: -0.0198,
    minJungsiBonus: -0.0321,
    susiBonus: -0.0123,
    jungsiBonus: -0.0456,
  },
  /* 16 */ {
    calculatedBonus: -0.0123,
    idealSusiBonus: -0.0123,
    idealJungsiBonus: -0.0456,
    minSusiBonus: -0.0198,
    minJungsiBonus: -0.0321,
    susiBonus: -0.0123,
    jungsiBonus: -0.0456,
  },
  /* 17 */ {
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  },
  /* 18 */ {
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  },
  /* 19 */ {
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  },
  /* 20 */ {
    calculatedBonus: 0.0123,
    idealSusiBonus: 0.0123,
    idealJungsiBonus: 0.0456,
    minSusiBonus: 0.0198,
    minJungsiBonus: 0.0321,
    susiBonus: 0.0123,
    jungsiBonus: 0.0456,
  },
  /* 21 */ {
    calculatedBonus: 0.0123,
    idealSusiBonus: 0.0123,
    idealJungsiBonus: 0.0456,
    minSusiBonus: 0.0198,
    minJungsiBonus: 0.0321,
    susiBonus: 0.0123,
    jungsiBonus: 0.0456,
  },
  /* 22 */ {
    calculatedBonus: 0.0123,
    idealSusiBonus: 0.0123,
    idealJungsiBonus: 0.0456,
    minSusiBonus: 0.0198,
    minJungsiBonus: 0.0321,
    susiBonus: 0.0123,
    jungsiBonus: 0.0456,
  },
  /* 23 */ {
    calculatedBonus: 0.0123,
    idealSusiBonus: 0.0123,
    idealJungsiBonus: 0.0456,
    minSusiBonus: 0.0198,
    minJungsiBonus: 0.0321,
    susiBonus: 0.0123,
    jungsiBonus: 0.0456,
  },
  /* 24 */ {
    calculatedBonus: 0.0135,
    idealSusiBonus: 0.0135,
    idealJungsiBonus: 0.0502,
    minSusiBonus: 0.0218,
    minJungsiBonus: 0.0353,
    susiBonus: 0.0135,
    jungsiBonus: 0.0502,
  },
  /* 25 */ {
    calculatedBonus: 0.0135,
    idealSusiBonus: 0.0135,
    idealJungsiBonus: 0.0502,
    minSusiBonus: 0.0218,
    minJungsiBonus: 0.0353,
    susiBonus: 0.0135,
    jungsiBonus: 0.0502,
  },
  /* 26 */ {
    calculatedBonus: 0.0148,
    idealSusiBonus: 0.0148,
    idealJungsiBonus: 0.0547,
    minSusiBonus: 0.0238,
    minJungsiBonus: 0.0385,
    susiBonus: 0.0148,
    jungsiBonus: 0.0547,
  },
  /* 27 */ {
    calculatedBonus: 0.0123,
    idealSusiBonus: 0.0123,
    idealJungsiBonus: 0.0456,
    minSusiBonus: 0.0198,
    minJungsiBonus: 0.0321,
    susiBonus: 0.0123,
    jungsiBonus: 0.0456,
  },
  /* 28 */ {
    calculatedBonus: 0.0012,
    idealSusiBonus: 0.0012,
    idealJungsiBonus: 0.0046,
    minSusiBonus: 0.002,
    minJungsiBonus: 0.0032,
    susiBonus: 0.0012,
    jungsiBonus: 0.0046,
  },
  /* 29 */ {
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  },
  /* 30 */ {
    calculatedBonus: 0.0148,
    idealSusiBonus: 0.0148,
    idealJungsiBonus: 0.0547,
    minSusiBonus: 0.0238,
    minJungsiBonus: 0.0385,
    susiBonus: 0.0148,
    jungsiBonus: 0.0547,
  },
  /* 31 */ {
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  },
  /* 32 */ {
    calculatedBonus: -0.01,
    idealSusiBonus: -0.01,
    idealJungsiBonus: -0.02,
    minSusiBonus: -0.033,
    minJungsiBonus: -0.044,
    susiBonus: -0.01,
    jungsiBonus: -0.02,
  },
  /* 33 */ {
    calculatedBonus: 0.01,
    idealSusiBonus: 0.01,
    idealJungsiBonus: 0.02,
    minSusiBonus: 0.03,
    minJungsiBonus: 0.04,
    susiBonus: 0.01,
    jungsiBonus: 0.02,
  },
  /* 34 */ {
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  },
  /* 35 */ {
    calculatedBonus: -0,
    idealSusiBonus: -0,
    idealJungsiBonus: -0,
    minSusiBonus: -0,
    minJungsiBonus: -0,
    susiBonus: -0,
    jungsiBonus: -0,
  },
  /* 36 */ {
    calculatedBonus: 0.0123,
    idealSusiBonus: 0.0123,
    idealJungsiBonus: 0.0456,
    minSusiBonus: 0.0218,
    minJungsiBonus: 0.0353,
    susiBonus: 0.0123,
    jungsiBonus: 0.0456,
  },
  /* 37 */ {
    calculatedBonus: 0.0123,
    idealSusiBonus: 0.0123,
    idealJungsiBonus: 0.0456,
    minSusiBonus: 0.0198,
    minJungsiBonus: 0.0321,
    susiBonus: 0.0123,
    jungsiBonus: 0.0456,
  },
];

test("calculateDailyBonus: 골든 픽스처", () => {
  expect(CDB_CASES.length, "케이스 수와 픽스처 수가 다르다").toBe(
    EXPECTED_CDB.length,
  );
  CDB_CASES.forEach(([ach, foc, rates, tasks, sh, ih, mh], idx) => {
    const result = calculateDailyBonus(
      ach as string,
      foc as string,
      rates[0]!,
      rates[1]!,
      rates[2]!,
      rates[3]!,
      tasks,
      sh,
      // ih/mh 열에는 문자열('8'·'abc')·null·undefined 도 섞여 있고 함수 시그니처는
      // number 라 캐스팅만 한다.
      ih as number,
      mh as number,
    );
    assertBonusEqual(
      result,
      EXPECTED_CDB[idx],
      `[${idx}] ach=${ach} foc=${foc} h=${sh}/${ih}/${mh}`,
    );
  });
});

test("calculateDailyBonus: 0시간 + 목표 0시간이면 감점 없이 전부 0", () => {
  const r = calculateDailyBonus(
    "full",
    "good",
    0.1,
    0.2,
    0.3,
    0.4,
    [],
    0,
    0,
    0,
  );
  expect(r).toEqual({
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  });
});

test("calculateDailyBonus: 0시간 감점은 rate 전액이며 clamp 가 없다", () => {
  const r = calculateDailyBonus(
    "full",
    "excellent",
    0.5,
    0.6,
    0.7,
    0.8,
    [],
    0,
    8,
    5,
  );
  assertClose(r.idealSusiBonus, -0.5, "idealSusiBonus");
  assertClose(r.idealJungsiBonus, -0.6, "idealJungsiBonus");
  assertClose(r.minSusiBonus, -0.7, "minSusiBonus");
  assertClose(r.minJungsiBonus, -0.8, "minJungsiBonus");
  // 성취도·집중도·태그는 0시간 분기에서 전혀 반영되지 않는다.
  const withTasks = calculateDailyBonus(
    "none",
    "veryLow",
    0.5,
    0.6,
    0.7,
    0.8,
    ["내신 과목"],
    0,
    8,
    5,
  );
  expect(withTasks).toEqual(r);
});

test("calculateDailyBonus: rate 가 0 인 채 0시간이면 -0 이 나온다 (원본 그대로)", () => {
  const r = calculateDailyBonus("full", "good", 0, 0, 0, 0, [], 0, 8, 5);
  expect(
    Object.is(r.idealSusiBonus, -0),
    "idealSusiBonus 는 -0 이어야 한다",
  ).toBeTruthy();
  expect(
    Object.is(r.minJungsiBonus, -0),
    "minJungsiBonus 는 -0 이어야 한다",
  ).toBeTruthy();
});

test("calculateDailyBonus: 태그 가산은 수시/정시로 갈린다", () => {
  const plain = calculateDailyBonus("full", "good", 1, 1, 1, 1, [], 10, 10, 10);
  const naesin = calculateDailyBonus(
    "full",
    "good",
    1,
    1,
    1,
    1,
    ["내신 과목"],
    10,
    10,
    10,
  );
  const mock = calculateDailyBonus(
    "full",
    "good",
    1,
    1,
    1,
    1,
    ["기출/모의고사"],
    10,
    10,
    10,
  );

  assertClose(
    naesin.idealSusiBonus,
    plain.idealSusiBonus * 1.1,
    "내신 → 수시 1.1배",
  );
  assertClose(
    naesin.minSusiBonus,
    plain.minSusiBonus * 1.1,
    "내신 → 최소수시 1.1배",
  );
  assertClose(
    naesin.idealJungsiBonus,
    plain.idealJungsiBonus,
    "내신은 정시 미영향",
  );

  assertClose(
    mock.idealJungsiBonus,
    plain.idealJungsiBonus * 1.1,
    "기출 → 정시 1.1배",
  );
  assertClose(
    mock.minJungsiBonus,
    plain.minJungsiBonus * 1.1,
    "기출 → 최소정시 1.1배",
  );
  assertClose(mock.idealSusiBonus, plain.idealSusiBonus, "기출은 수시 미영향");
});

test("calculateDailyBonus: 별칭 필드는 항상 이상 목표 값을 가리킨다", () => {
  const r = calculateDailyBonus(
    "full",
    "good",
    0.1,
    0.2,
    0.9,
    0.8,
    [],
    10,
    10,
    10,
  );
  expect(r.calculatedBonus).toBe(r.idealSusiBonus);
  expect(r.susiBonus).toBe(r.idealSusiBonus);
  expect(r.jungsiBonus).toBe(r.idealJungsiBonus);
});

test("calculateDailyBonus: tasks 가 배열이 아니면 TypeError (원본 그대로, 가드 없음)", () => {
  expect(() =>
    calculateDailyBonus(
      "full",
      "good",
      0.1,
      0.2,
      0.3,
      0.4,
      null as unknown as string[],
      8,
      8,
      5,
    ),
  ).toThrow(TypeError);
  // 단, 0시간 분기는 tasks 를 만지기 전에 반환하므로 예외가 나지 않는다.
  expect(() =>
    calculateDailyBonus(
      "full",
      "good",
      0.1,
      0.2,
      0.3,
      0.4,
      null as unknown as string[],
      0,
      8,
      5,
    ),
  ).not.toThrow();
});

test("calculateDailyBonus: 순수 함수 — 같은 입력이면 항상 같은 출력이고 인자를 변형하지 않는다", () => {
  const tasks = ["내신 과목", "기출/모의고사"];
  const snapshot = [...tasks];
  const a = calculateDailyBonus(
    "mid",
    "normal",
    0.11,
    0.22,
    0.33,
    0.44,
    tasks,
    7,
    8,
    5,
  );
  const b = calculateDailyBonus(
    "mid",
    "normal",
    0.11,
    0.22,
    0.33,
    0.44,
    tasks,
    7,
    8,
    5,
  );
  expect(a).toEqual(b);
  expect(tasks).toEqual(snapshot);
});

// ─────────────────────────────────────────────────────────────
// 게이지 통합 시나리오
// ─────────────────────────────────────────────────────────────

test("게이지 통합: 매일 목표를 정확히 채우면 D-day 에 100% 에 도달한다", () => {
  // 고3, 수시 기준확률 40 → D-day 까지 남은 일수로 나눈 rate 를 매일 더한다.
  const now = new Date(2026, 7, 11);
  const rates = calcStudentBonusRates("고3", 40, 40, 40, 40, now);
  const days = Math.round((100 - 40) / rates.idealSusiBonus);

  let gauge = 40;
  for (let d = 0; d < days; d += 1) {
    // 성취도 full · 집중도 good · 목표 정확 달성 · 태그 없음 → 배수 전부 1.0
    const bonus = calculateDailyBonus(
      "full",
      "good",
      rates.idealSusiBonus,
      rates.idealJungsiBonus,
      rates.minSusiBonus,
      rates.minJungsiBonus,
      [],
      8,
      8,
      8,
    );
    gauge += bonus.idealSusiBonus;
  }
  // round4 누적 오차 때문에 정확히 100 은 아니다 — 원본도 같은 오차를 갖는다.
  expect(
    Math.abs(gauge - 100) < 0.5,
    `게이지 ${gauge} 가 100 근처가 아니다`,
  ).toBeTruthy();
});

test("calcStudentBonusRates: 기준일은 넘겨준 시간대의 오늘이고 실행 환경 TZ와 무관하다", () => {
  // 2026-09-10T15:30Z = 서울 9/11(수시 기준일 9/12까지 1일), 로스앤젤레스 9/10(2일).
  // process.env.TZ 는 Asia/Seoul 로 고정돼 있어, 시간대 인자를 무시하면 서울 값이 둘 다 나온다.
  const instant = new Date("2026-09-10T15:30:00Z");
  const seoul = calcStudentBonusRates("고3", 0, 0, 0, 0, instant, "Asia/Seoul");
  const la = calcStudentBonusRates(
    "고3",
    0,
    0,
    0,
    0,
    instant,
    "America/Los_Angeles",
  );
  assertClose(seoul.idealSusiBonus, 100, "서울 D-1");
  assertClose(la.idealSusiBonus, 50, "LA D-2");
});
