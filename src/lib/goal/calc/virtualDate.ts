/**
 * 가상 날짜 · 주차 경계 계산 (순수 함수)
 *
 * 원본: /Users/hyunsoo/uwellnow/target/api/student.mjs
 *   - toYMD                              : 144-150
 *   - kstYMD                             : 152-159
 *   - getRecordDateFromActualStart       : 732-740
 *   - getDayIndexFromYMDServer           : 743-748
 *   - addDaysYMD                         : 750-755
 *   - getMondayYMD                       : 757-759
 *   - getFirstSundayYMD                  : 761-764
 *   - isMiniStartDay                     : 766-769
 *   - getWeeklyReportRange               : 797-830
 *   - getRegularWeekIndexFromSundayCount : 845-849
 *
 * 원본 동작을 그대로 재현한다. 원본이 내부에서 `new Date()` 로 "오늘"을 읽던 자리는
 * 테스트 가능성을 위해 마지막 인자 `now` 로 노출했고, 기본값만 `new Date()` 로 둔다.
 *
 * 요일 인덱스 규약: **월요일 = 0 … 일요일 = 6** (JS `getUTCDay()` 의 일요일=0 과 다르다).
 */

// diffDaysYMD 전용. addDaysYMD/getDayIndexFromYMDServer 는 Date.UTC 만 쓰고
// 밀리초 나눗셈이 필요 없어 이 상수를 쓰지 않는다.
import { ymdIn } from "../../time/day.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** YMD 문자열 정규화. 원본 student.mjs:144-150 */
export function toYMD(v: unknown) {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  // v 는 여기선 truthy 한 임의값이다(원본 그대로 Date 생성자에 그냥 넘긴다 — 방어 없음).
  const d = new Date(v as string | number | Date);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toISOString().slice(0, 10); // tz-literal-ok: Date 입력은 서버 규칙(UTC)대로 UTC 날짜로 읽는다
}

// 이 모듈은 한국 서비스의 KST 영업일 규칙을 서버와 공유한다. 다른 시간대는 time 모듈의 ymdIn 으로 직접 계산한다.
const KST_ZONE = "Asia/Seoul"; // tz-literal-ok: goal 계산 엔진의 KST 영업일 규칙(U4b-goal-api가 시간대 인자로 옮길 때까지 유지)

/** 주어진 시각의 KST 날짜를 'YYYY-MM-DD' 로. 원본 student.mjs:152-159 */
export function kstYMD(date = new Date()) {
  return ymdIn(date, KST_ZONE);
}

/**
 * 실제 시작일 + recordIndex 일 = 해당 기록의 가상 날짜.
 * 원본 student.mjs:732-740
 *
 * 달력 날짜(YMD)끼리 UTC 로 더하므로 실행 환경의 시간대와 DST 에 영향받지 않는다.
 *
 * NOTE(target-parity): recordIndex 가 숫자로 변환되지 않는 값('abc' 등)이면
 * setDate(NaN) → Invalid Date → Intl.format 이 RangeError 를 던진다. 원본 그대로.
 *
 * @deprecated "제출 N번 = N일차" 가상 달력 모델(record_index 가 제출 순번) 전용이다.
 * goal_daily_records 는 실제 달력 모델로 전환했다(record_index = actual_start_date부터
 * 실제 KST 경과 일수, diffDaysYMD 로 구한다) — 이 함수는 더 이상 record_date 산출에
 * 쓰이지 않는다. 기존 테스트(virtualDate.test.js) 동결 유지를 위해 본문은 그대로 둔다.
 */
export function getRecordDateFromActualStart(
  actualStartDate: unknown,
  recordIndex: unknown,
  now = new Date(),
) {
  if (!actualStartDate) return kstYMD(now);

  const [y, m, d] = String(actualStartDate).slice(0, 10).split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, d!));
  if (Number.isNaN(start.getTime())) return kstYMD(now);

  // 달력 날짜끼리의 덧셈이라 실행 환경의 시간대와 DST 에 영향받지 않는다.
  start.setUTCDate(start.getUTCDate() + Number(recordIndex || 0));
  return start.toISOString().slice(0, 10); // tz-literal-ok: Date.UTC 기준 달력 계산이라 시간대와 무관하다
}

/**
 * YMD → 요일 인덱스(월=0 … 일=6). 원본 student.mjs:743-748
 *
 * UTC 기준으로 요일을 뽑고 `jsDay === 0 ? 6 : jsDay - 1` 로 월요일 기준으로 옮긴다.
 *
 * NOTE(target-parity): 파싱 불가한 문자열('garbage!!' 등)은 NaN 을 반환한다.
 * (Invalid Date → getUTCDay() = NaN → NaN - 1 = NaN)
 */
export function getDayIndexFromYMDServer(ymd: unknown, now = new Date()) {
  const s = toYMD(ymd) || kstYMD(now);
  const [y, m, d] = s.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * YMD 에 days 를 더한 YMD. 원본 student.mjs:750-755
 *
 * Date.UTC 로 계산하므로 월말·연말·윤년 롤오버가 자동 처리되고 타임존 영향이 없다.
 *
 * NOTE(target-parity): ymd 나 days 가 숫자로 파싱되지 않으면 Invalid Date 가 되어
 * toISOString() 이 RangeError 를 던진다. 원본에 예외 처리가 없다.
 */
export function addDaysYMD(ymd: unknown, days: unknown, now = new Date()) {
  const s = toYMD(ymd) || kstYMD(now);
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + Number(days || 0)));
  return dt.toISOString().slice(0, 10); // tz-literal-ok: Date.UTC 기준 달력 계산이라 시간대와 무관하다
}

/** 해당 날짜가 속한 주의 월요일. 원본 student.mjs:757-759 */
export function getMondayYMD(ymd: unknown, now = new Date()) {
  return addDaysYMD(ymd, -getDayIndexFromYMDServer(ymd, now), now);
}

/** 시작일 이후(당일 포함) 첫 일요일. 원본 student.mjs:761-764 */
export function getFirstSundayYMD(startDate: unknown, now = new Date()) {
  const idx = getDayIndexFromYMDServer(startDate, now);
  return addDaysYMD(startDate, 6 - idx, now);
}

/**
 * 미니 온보딩 시작일 여부 — 목(3)·금(4)·토(5) 에 시작하면 true.
 * 원본 student.mjs:766-769
 */
export function isMiniStartDay(startDate: unknown, now = new Date()) {
  const idx = getDayIndexFromYMDServer(startDate, now);
  return idx >= 3 && idx <= 5;
}

/**
 * 주차별 리포트 기간(시작·종료일·주차 유형). 원본 student.mjs:797-830
 *
 * - 미니 온보딩(목·금·토 시작) + weekIndex 0 → 시작일 ~ 첫 일요일 (mini-onboarding, 일할)
 * - 비(非)미니 + weekIndex 1 + 시작 요일이 월요일이 아님 → 시작일 ~ 시작주 일요일 (first-week, 일할)
 * - 그 밖 → 시작주 월요일에서 offsetWeeks 주 뒤의 월~일 (regular)
 *   offsetWeeks = 미니면 idx, 아니면 idx - 1 (음수는 0 으로 clamp)
 *
 * NOTE(target-parity): 월요일 시작(비미니)일 때 weekIndex 0 과 1 이 완전히 같은 구간을
 * 돌려준다. (idx=1 은 `getDayIndexFromYMDServer(startDate) > 0` 조건에서 걸러지고,
 * idx=0 은 offsetWeeks=-1 이 0 으로 clamp 되기 때문)
 *
 * NOTE(target-parity): 일요일 시작(비미니)일 때 weekIndex 1 은 startDate === endDate 인
 * 하루짜리 first-week 가 되고, weekIndex 0 은 시작일보다 앞선 월~일 한 주를 돌려준다.
 *
 * NOTE(target-parity): 미니 온보딩일 때 weekIndex 를 음수로 주면 첫 분기(idx === 0)에
 * 걸리지 않아 mini-onboarding 이 아니라 regular 로 떨어진다.
 */
export function getWeeklyReportRange(
  student: { actual_start_date?: unknown },
  weekIndex: unknown,
  now = new Date(),
) {
  const startDate = toYMD(student.actual_start_date) || kstYMD(now);
  const startMonday = getMondayYMD(startDate, now);
  const mini = isMiniStartDay(startDate, now);
  const idx = Number(weekIndex || 0);

  if (mini && idx === 0) {
    return {
      startDate,
      endDate: getFirstSundayYMD(startDate, now),
      weekType: "mini-onboarding",
      isProrated: true,
    };
  }

  if (!mini && idx === 1 && getDayIndexFromYMDServer(startDate, now) > 0) {
    return {
      startDate,
      endDate: addDaysYMD(startMonday, 6, now),
      weekType: "first-week",
      isProrated: true,
    };
  }

  const offsetWeeks = mini ? idx : idx - 1;
  const periodMonday = addDaysYMD(
    startMonday,
    Math.max(0, offsetWeeks) * 7,
    now,
  );

  return {
    startDate: periodMonday,
    endDate: addDaysYMD(periodMonday, 6, now),
    weekType: "regular",
    isProrated: false,
  };
}

/**
 * 누적 일요일 기록 수 → 정규 주차 인덱스. 원본 student.mjs:845-849
 *
 * 미니 온보딩으로 시작한 학생은 첫 일요일이 온보딩 주에 속하므로 1 을 뺀다.
 *
 * NOTE(target-parity): 비미니면 sundayCount 를 그대로 돌려준다 — 음수·undefined 도
 * 그대로 새어 나간다(Math.max clamp 는 미니 분기에만 있다).
 *
 * @deprecated getRecordDateFromActualStart 와 같은 사유로 실제 달력 모델 전환 이후
 * 더 이상 주차 산정에 쓰이지 않는다. 기존 테스트 동결 유지를 위해 본문은 그대로 둔다.
 */
export function getRegularWeekIndexFromSundayCount(
  student: { actual_start_date?: unknown },
  sundayCount: number,
  now = new Date(),
) {
  const startDate = toYMD(student.actual_start_date) || kstYMD(now);
  const mini = isMiniStartDay(startDate, now);
  return mini ? Math.max(0, sundayCount - 1) : sundayCount;
}

/**
 * to - from 의 날짜 차이(일수). addDaysYMD 와 같은 UTC 앵커 기법 — 로컬 타임존·DST
 * 영향을 받지 않는다.
 *
 * 실제 달력 모델(record_index = actual_start_date부터 실제 KST 경과 일수)의 핵심
 * 계산이다: recordIndex = diffDaysYMD(actual_start_date, kstYMD(now)).
 *
 * NOTE: addDaysYMD(87-92행)와 동일하게, 파싱 불가한 값이면 Invalid Date →
 * Date.UTC 가 NaN 을 삼켜 결과가 NaN 이 된다(예외를 던지지 않는다). 호출자가
 * 파싱 가능한 YMD 를 보장해야 한다.
 *
 * @param {string} fromYMD 기준 날짜(YMD 또는 파싱 가능한 값).
 * @param {string} toYMDValue 대상 날짜.
 * @param {Date} [now] fromYMD/toYMDValue 가 비어 있을 때의 폴백 기준 시각.
 * @returns {number} toYMDValue - fromYMD (일수). 양수면 toYMDValue 가 미래.
 */
export function diffDaysYMD(
  fromYMD: unknown,
  toYMDValue: unknown,
  now = new Date(),
) {
  const fromStr = toYMD(fromYMD) || kstYMD(now);
  const toStr = toYMD(toYMDValue) || kstYMD(now);

  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);

  const fromMs = Date.UTC(fy!, fm! - 1, fd!);
  const toMs = Date.UTC(ty!, tm! - 1, td!);

  return Math.round((toMs - fromMs) / MS_PER_DAY);
}
