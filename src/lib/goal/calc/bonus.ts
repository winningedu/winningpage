// 목표관리 "일별 증분(확률 게이지)" 계산 모듈.
//
// 이 시스템에서 합격 확률은 "성적 → 확률" 함수가 아니라 매일 채우는 게이지다.
//   1) calcStudentBonusRates 가 학생별 1일치 증분율(rate)을 미리 구해둔다.
//        rate = (100 − 기준확률) / D-day 일수
//      → 하루도 빠짐없이 목표를 100% 채우면 D-day에 정확히 100%에 도달하는 설계.
//   2) calculateDailyBonus 가 매일의 제출 1건에서 실제로 더할 값을 구한다.
//        증분 = rate × 성취도배수 × 집중도배수 × 달성률배수 × 과목태그배수
//      0시간 제출은 rate 전액을 감점(음수)한다.
//
// 원본(외부 앱) 위치:
//   - calcStudentBonusRates        : target/api/student.mjs:404-442
//   - getAchievementRateMultiplier : target/App.tsx:33-38
//   - calculateDailyBonus          : target/App.tsx:42-94
//   - 배수 상수 2종                : target/App.tsx:22-27
//
// 이식 원칙: 원본 동작을 그대로 재현한다. 이상해 보여도 고치지 않고 NOTE(target-parity)로만 남긴다.
// 유일한 의도적 변경은 "현재 시각 주입"이다 — 원본 calcStudentBonusRates 는 내부에서 new Date()
// 를 읽어 테스트가 불가능했다. now 를 기본값 인자로 노출해 고정 날짜를 주입할 수 있게 했다.
//
// 이 모듈은 순수 함수만 담는다. React·DOM·Supabase·네트워크·전역 상태 의존 없음.
// 특히 calculateDailyBonus 는 원본에서 "클라이언트가 계산해 서버로 전송"하는 구조라(확률 조작 가능)
// 추후 서버로 그대로 옮길 수 있어야 한다. 브라우저 API를 절대 끌어들이지 말 것.

import { ymdIn } from "../../time/day.js";
import { browserTimeZone } from "../../time/zone.js";

// 성취도(자기평가) 배수. 원본 App.tsx:22-24.
export const ACHIEVEMENT_MULTIPLIER = {
  full: 1.0,
  high: 0.9,
  mid: 0.7,
  low: 0.4,
  none: 0.1,
};

// 집중도 배수. 원본 App.tsx:25-27.
// NOTE(target-parity): excellent 는 1.1 이라 "기준 rate 초과" 증분이 가능하다. 상한 clamp 없음.
export const FOCUS_MULTIPLIER = {
  excellent: 1.1,
  good: 1.0,
  normal: 0.9,
  low: 0.7,
  veryLow: 0.5,
};

// 과목 태그 가산 배수와 태그 문자열. 원본 App.tsx:87-88 의 하드코딩을 상수로만 뽑았다(값 동일).
export const TASK_BONUS_MULTIPLIER = 1.1;
export const TASK_NAESIN = "내신 과목";
export const TASK_MOCK_EXAM = "기출/모의고사";

// 수시 기준일 = 매년 9월 12일, 정시 기준일 = 매년 11월 19일. 원본 student.mjs:408-409.
// (Date 월 인자는 0-base라 8 = 9월, 10 = 11월)
const SUSI_BASE_MONTH = 8;
const SUSI_BASE_DATE = 12;
const JUNGSI_BASE_MONTH = 10;
const JUNGSI_BASE_DATE = 19;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 서버(api/student.mjs:243-245)의 round4. Number(v || 0) 을 거치므로 NaN·null·undefined·'abc' 는 0이 된다.
function round4Server(v: unknown) {
  return Math.round(Number(v || 0) * 10000) / 10000;
}

// 클라이언트(App.tsx:40)의 round4. 서버판과 달리 Number(v || 0) 정규화가 없어 NaN 이 NaN 그대로 나온다.
// NOTE(target-parity): 같은 이름의 round4 가 원본에 두 벌 있고 NaN 처리가 서로 다르다. 통일하지 않는다.
function round4Client(v: number) {
  return Math.round(v * 10000) / 10000;
}

// calcStudentBonusRates 반환 4종.
export interface StudentBonusRates {
  idealSusiBonus: number;
  idealJungsiBonus: number;
  minSusiBonus: number;
  minJungsiBonus: number;
}

// calculateDailyBonus 반환값. 4종 + 하위호환 별칭 3종.
export interface DailyBonusResult {
  calculatedBonus: number;
  idealSusiBonus: number;
  idealJungsiBonus: number;
  minSusiBonus: number;
  minJungsiBonus: number;
  susiBonus: number;
  jungsiBonus: number;
}

/**
 * 학생별 1일치 확률 증분율(rate) 4종을 구한다. 원본: api/student.mjs:404-442.
 *
 * rate = (100 − 기준확률) / (기준일까지 남은 일수 + 학년 오프셋)
 *
 * @param {string} grade 학년 문자열('고3'~'초1'). 미지값은 오프셋 0(=고3 취급).
 * @param {number} idealSusi 이상 목표 수시 기준확률
 * @param {number} idealJungsi 이상 목표 정시 기준확률
 * @param {number} minSusi 최소 목표 수시 기준확률
 * @param {number} minJungsi 최소 목표 정시 기준확률
 * @param {Date} [nowInput] 현재 시각(테스트 주입용). 원본은 내부에서 new Date() 를 읽었다.
 */
export function calcStudentBonusRates(
  grade: string,
  idealSusi: number,
  idealJungsi: number,
  minSusi: number,
  minJungsi: number,
  nowInput = new Date(),
  tz = browserTimeZone(),
): StudentBonusRates {
  // 기준일 계산은 tz 의 달력 날짜끼리 뺀다. 실행 환경의 로컬 시간대와 DST 에 영향받지 않는다.
  // tz 를 생략하면 실행 환경의 시간대를 쓴다(서버는 UTC).
  const todayYmd = ymdIn(nowInput, tz);
  const y = Number(todayYmd.slice(0, 4));
  const baseYmd = (year: number, month: number, date: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
  const daysBetween = (fromYmd: string, toYmd: string) =>
    Math.round(
      (Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) /
        MS_PER_DAY,
    );

  // 기준일 당일이면 이미 지난 것으로 보고 내년으로 넘긴다(<= 이므로 당일 포함).
  let susiBase = baseYmd(y, SUSI_BASE_MONTH, SUSI_BASE_DATE);
  let jungsiBase = baseYmd(y, JUNGSI_BASE_MONTH, JUNGSI_BASE_DATE);
  if (susiBase <= todayYmd)
    susiBase = baseYmd(y + 1, SUSI_BASE_MONTH, SUSI_BASE_DATE);
  if (jungsiBase <= todayYmd)
    jungsiBase = baseYmd(y + 1, JUNGSI_BASE_MONTH, JUNGSI_BASE_DATE);

  const daysToSusi = Math.max(1, daysBetween(todayYmd, susiBase));
  const daysToJungsi = Math.max(1, daysBetween(todayYmd, jungsiBase));

  // 학년 오프셋 12단. 고3=0 기준으로 한 학년 아래마다 365일씩 더한다.
  // NOTE(target-parity): 원본이 if-else 사슬이다. 객체 맵 + ?? 0 으로 바꾸면 grade 가
  // 'constructor' 같은 Object.prototype 키일 때 결과가 달라지므로 사슬 그대로 옮긴다.
  let offset = 0;

  if (grade === "고2") offset = 365;
  else if (grade === "고1") offset = 730;
  else if (grade === "중3") offset = 1095;
  else if (grade === "중2") offset = 1460;
  else if (grade === "중1") offset = 1825;
  else if (grade === "초6") offset = 2190;
  else if (grade === "초5") offset = 2555;
  else if (grade === "초4") offset = 2920;
  else if (grade === "초3") offset = 3285;
  else if (grade === "초2") offset = 3650;
  else if (grade === "초1") offset = 4015;

  const totalSusiDays = daysToSusi + offset;
  const totalJungsiDays = daysToJungsi + offset;

  // NOTE(target-parity): 기준확률이 100을 넘으면 rate 가 음수가 된다(clamp 없음).
  // 그 상태로 calculateDailyBonus 에 들어가면 열심히 할수록 확률이 깎인다.
  return {
    idealSusiBonus: round4Server((100 - idealSusi) / totalSusiDays),
    idealJungsiBonus: round4Server((100 - idealJungsi) / totalJungsiDays),
    minSusiBonus: round4Server((100 - minSusi) / totalSusiDays),
    minJungsiBonus: round4Server((100 - minJungsi) / totalJungsiDays),
  };
}

/**
 * 목표 대비 달성률(%)을 배수로 환산한다. 원본: App.tsx:33-38.
 *
 * 170% 초과 → 1.2 / 130% 초과 → 1.1 / 100% 이상 → 1.0 / 그 미만은 rate/100 을 선형 적용(음수는 0).
 * NOTE(target-parity): 130·170 은 "초과"(>), 100 은 "이상"(>=)이라 부등호 방향이 섞여 있다.
 * 즉 정확히 130%, 170% 를 찍으면 아래 구간(1.0, 1.1)으로 떨어진다.
 * NOTE(target-parity): rate 가 NaN 이면 모든 비교가 false 라 NaN/100 = NaN 이 그대로 반환된다.
 *
 * @param {number} rate 달성률(%) — 100 이 목표 정확 달성
 * @returns {number} 0 ~ 1.2 배수
 */
export function getAchievementRateMultiplier(rate: number) {
  if (rate > 170) return 1.2;
  if (rate > 130) return 1.1;
  if (rate >= 100) return 1.0;
  return Math.max(0, rate / 100);
}

/**
 * 하루 제출 1건이 확률 게이지에 더할 증분 4종(+ 하위호환 별칭 3종)을 구한다.
 * 원본: App.tsx:42-94.
 *
 * NOTE(target-parity): 원본은 이 계산을 브라우저에서 수행해 결과값을 그대로 서버에 저장한다.
 * 즉 클라이언트가 확률 증분을 임의로 조작할 수 있다. 이식 단계에서는 동작만 옮기고,
 * 서버 이관 시 이 함수를 서버 측 단일 진실 공급원으로 삼는다.
 *
 * @param {string} achievement 성취도 키(full/high/mid/low/none)
 * @param {string} focus 집중도 키(excellent/good/normal/low/veryLow)
 * @param {number} idealSusiRate 이상 목표 수시 1일 증분율
 * @param {number} idealJungsiRate 이상 목표 정시 1일 증분율
 * @param {number} minSusiRate 최소 목표 수시 1일 증분율
 * @param {number} minJungsiRate 최소 목표 정시 1일 증분율
 * @param {string[]} tasks 오늘 한 학습 유형 태그 배열
 * @param {number} studyHours 실제 학습 시간
 * @param {number} idealHours 오늘 이상 목표 시간
 * @param {number} minHours 오늘 최소 목표 시간
 */
export function calculateDailyBonus(
  achievement: string,
  focus: string,
  idealSusiRate: number,
  idealJungsiRate: number,
  minSusiRate: number,
  minJungsiRate: number,
  tasks: string[],
  studyHours: number,
  idealHours: number,
  minHours: number,
): DailyBonusResult {
  const normalizedIdealHours = Number(idealHours || 0);
  const normalizedMinHours = Number(minHours || 0);

  const zeroBonus = {
    calculatedBonus: 0,
    idealSusiBonus: 0,
    idealJungsiBonus: 0,
    minSusiBonus: 0,
    minJungsiBonus: 0,
    susiBonus: 0,
    jungsiBonus: 0,
  };

  // 일요일 보충 목표가 0시간인 경우 0시간 제출을 감점 처리하지 않음
  if (
    studyHours === 0 &&
    normalizedIdealHours <= 0 &&
    normalizedMinHours <= 0
  ) {
    return zeroBonus;
  }

  // 0시간 제출 = 그날치 rate 전액 차감.
  // NOTE(target-parity): 감점 폭이 "이상 목표 rate" 기준이라 최소 목표만 있는 날도 이상 rate 로 깎인다.
  // NOTE(target-parity): studyHours === 0 엄격 비교라 '0'(문자열)이나 -0 아닌 음수는 이 분기를 타지 않는다.
  //   음수 시간이 들어오면 아래 정상 분기에서 음수 증분이 그대로 계산된다(입력 검증 없음).
  if (studyHours === 0) {
    return {
      calculatedBonus: round4Client(-idealSusiRate),
      idealSusiBonus: round4Client(-idealSusiRate),
      idealJungsiBonus: round4Client(-idealJungsiRate),
      minSusiBonus: round4Client(-minSusiRate),
      minJungsiBonus: round4Client(-minJungsiRate),
      susiBonus: round4Client(-idealSusiRate),
      jungsiBonus: round4Client(-idealJungsiRate),
    };
  }

  // NOTE(target-parity): 성취도 미지값은 0배(=증분 0), 집중도 미지값은 1배로 기본값이 서로 다르다.
  const achMult = ACHIEVEMENT_MULTIPLIER[achievement] ?? 0;
  const focMult = FOCUS_MULTIPLIER[focus] ?? 1;

  // NOTE(target-parity): 목표 시간이 0 이하면 달성률을 100%로 간주한다(분모 0 회피).
  const idealRate =
    normalizedIdealHours > 0 ? (studyHours / normalizedIdealHours) * 100 : 100;
  const minRate =
    normalizedMinHours > 0 ? (studyHours / normalizedMinHours) * 100 : 100;
  const iRateMult = getAchievementRateMultiplier(idealRate);
  const mRateMult = getAchievementRateMultiplier(minRate);

  let iSusi = idealSusiRate * achMult * focMult * iRateMult;
  let iJungsi = idealJungsiRate * achMult * focMult * iRateMult;
  let mSusi = minSusiRate * achMult * focMult * mRateMult;
  let mJungsi = minJungsiRate * achMult * focMult * mRateMult;

  // 내신 과목은 수시에, 기출/모의고사는 정시에만 태그 가산.
  // NOTE(target-parity): tasks 가 배열이 아니면 여기서 TypeError 가 난다(가드 없음).
  if (tasks.includes(TASK_NAESIN)) {
    iSusi *= TASK_BONUS_MULTIPLIER;
    mSusi *= TASK_BONUS_MULTIPLIER;
  }
  if (tasks.includes(TASK_MOCK_EXAM)) {
    iJungsi *= TASK_BONUS_MULTIPLIER;
    mJungsi *= TASK_BONUS_MULTIPLIER;
  }

  // NOTE(target-parity): susiBonus/jungsiBonus/calculatedBonus 는 구 스키마 호환용 별칭이라
  // 전부 "이상 목표" 값을 가리킨다. 최소 목표 값은 minSusiBonus/minJungsiBonus 에만 있다.
  return {
    calculatedBonus: round4Client(iSusi),
    idealSusiBonus: round4Client(iSusi),
    idealJungsiBonus: round4Client(iJungsi),
    minSusiBonus: round4Client(mSusi),
    minJungsiBonus: round4Client(mJungsi),
    susiBonus: round4Client(iSusi),
    jungsiBonus: round4Client(iJungsi),
  };
}
