// 목표 학습시간 · 가용시간 · 대학 배율표 계산기
//
// 외부 앱(target)에서 이식했다. 원본 위치:
//   - sumWeeklySchedule          : target/api/student.mjs:444-458
//   - getEffectiveScheduleTarget : target/api/student.mjs:771-795
//   - getStudyMultiplier         : target/components/IntakeForm.tsx:967-988
//   - calcAvailableHours         : target/components/IntakeForm.tsx:990-1003
//   - calculateWeekSchedule      : target/components/IntakeForm.tsx:1005-1038
//   - 보조 헬퍼(toNum/toYMD/kstYMD/round1/getDayIndexFromYMDServer/addDaysYMD)
//                                : target/api/student.mjs:130-133, 144-159, 240-242, 743-754
//
// 이식 원칙은 "충실도 최우선"이다. 원본이 이상하게 동작하는 지점도 그대로 두고
// `NOTE(target-parity)` 주석으로만 표시했다. 고치지 말 것 — 회귀 테스트가 이 동작을 고정한다.
//
// 예외: `calcAvailableHoursApprox` 는 원본에 없는 우리 앱 전용 근사 어댑터다(맨 아래).

import { ymdIn } from "../../time/day.js";

// target/api/student.mjs:7 — 인덱스 0=월 … 6=일
export const VIRTUAL_DAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// 주간 목표에 포함되는 요일(월~토). 일요일은 보충일이라 제외된다.
const WEEKDAY_KEYS_MON_TO_SAT = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// ---------------------------------------------------------------------------
// 보조 헬퍼 — 원본 api/student.mjs 그대로
// ---------------------------------------------------------------------------

// student.mjs:130-133
function toNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// student.mjs:144-150
function toYMD(v: unknown) {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  // v 는 여기선 truthy 한 임의값이다(원본 그대로 Date 생성자에 그냥 넘긴다 — 방어 없음).
  const d = new Date(v as string | number | Date);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toISOString().slice(0, 10); // tz-literal-ok: Date 입력은 서버 규칙(UTC)대로 UTC 날짜로 읽는다
}

// 이 모듈은 한국 서비스의 KST 영업일 규칙을 서버와 공유한다. 다른 시간대는 time 모듈의 ymdIn 으로 직접 계산한다.
const KST_ZONE = "Asia/Seoul"; // tz-literal-ok: goal 계산 엔진의 KST 영업일 규칙(U4b-goal-api가 시간대 인자로 옮길 때까지 유지)

// student.mjs:152-159 — 현재 시각은 인자로 주입받는다(테스트 가능성). 원본도 기본값 인자였다.
function kstYMD(date = new Date()) {
  return ymdIn(date, KST_ZONE);
}

// student.mjs:240-242
function round1(v: unknown) {
  return Math.round(Number(v || 0) * 10) / 10;
}

// student.mjs:743-748 — 0=월 … 6=일. ymd 가 비면 오늘(KST)로 대체한다.
function getDayIndexFromYMDServer(ymd: unknown, now = new Date()) {
  const s = toYMD(ymd) || kstYMD(now);
  const [y, m, d] = s.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

// student.mjs:750-754
function addDaysYMD(ymd: unknown, days: unknown, now = new Date()) {
  const s = toYMD(ymd) || kstYMD(now);
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + Number(days || 0)));
  return dt.toISOString().slice(0, 10); // tz-literal-ok: Date.UTC 기준 달력 계산이라 시간대와 무관하다
}

// ---------------------------------------------------------------------------
// 1) 주간 목표 합계 — student.mjs:444-458
// ---------------------------------------------------------------------------

// 요일별 목표(ideal/min) 1행.
export interface DaySchedule {
  ideal?: number | string;
  min?: number | string;
}

/**
 * 요일별 목표(ideal/min)를 주간 합계로 접는다. **일요일은 제외**하고 월~토만 더한다.
 */
export function sumWeeklySchedule(
  weeklySchedule: Record<string, DaySchedule | undefined> | null | undefined,
) {
  let weekIdeal = 0;
  let weekMin = 0;

  // sunday 제외
  for (const day of WEEKDAY_KEYS_MON_TO_SAT) {
    weekIdeal += toNum(weeklySchedule?.[day]?.ideal);
    weekMin += toNum(weeklySchedule?.[day]?.min);
  }

  return {
    weekIdeal: round1(weekIdeal),
    weekMin: round1(weekMin),
  };
}

// ---------------------------------------------------------------------------
// 2) 기간 실목표 — student.mjs:771-795
// ---------------------------------------------------------------------------

/**
 * startDate~endDate 구간을 하루씩 훑으며 월~토에 해당하는 날의 목표만 누적한다.
 * 미니 온보딩 주(수~일 시작)처럼 주 중간에 시작하는 구간의 실목표를 구할 때 쓴다.
 *
 * @param startDate 'YYYY-MM-DD' (ISO 타임스탬프도 앞 10자리만 쓴다)
 * @param endDate   'YYYY-MM-DD' — startDate 보다 앞서면 빈 구간(0)
 * @param now 날짜가 비었을 때 쓰는 기준 시각. 테스트에서 주입한다.
 */
export function getEffectiveScheduleTarget(
  student:
    | { study_schedule?: Record<string, DaySchedule | undefined> }
    | null
    | undefined,
  startDate: unknown,
  endDate: unknown,
  now = new Date(),
) {
  const schedule = student?.study_schedule || {};
  let ideal = 0;
  let min = 0;
  let cursor = toYMD(startDate);
  const end = toYMD(endDate);

  // NOTE(target-parity): 커서 비교가 문자열 사전순(`cursor <= end`)이다. 'YYYY-MM-DD'
  // 고정폭이면 사전순 = 시간순이라 정상 동작하지만, 다른 포맷이 들어오면 무한 루프/오작동이
  // 될 수 있다. 원본 그대로 둔다.
  while (cursor && end && cursor <= end) {
    const idx = getDayIndexFromYMDServer(cursor, now);

    // 월~토만 주간 목표에 포함, 일요일은 보충일
    if (idx >= 0 && idx <= 5) {
      const dayName = VIRTUAL_DAY_NAMES[idx]!;
      ideal += toNum(schedule?.[dayName]?.ideal);
      min += toNum(schedule?.[dayName]?.min);
    }

    cursor = addDaysYMD(cursor, 1, now);
  }

  return {
    ideal: round1(ideal),
    min: round1(min),
  };
}

// ---------------------------------------------------------------------------
// 3) 대학·학과별 학습강도 배율표 — IntakeForm.tsx:967-988
// ---------------------------------------------------------------------------

/**
 * 목표 대학·학과로 학습강도 배율(0.46~0.90)을 고른다. 17단 하드코딩 표다.
 * 위에서부터 먼저 맞는 조건이 이긴다 — 순서가 곧 우선순위다.
 *
 * NOTE(target-parity): 아래 분기들은 문자열 `includes` 로 학과를 판정하는데,
 *   '치의예과'·'한의예과'·'수의예과' 는 모두 부분문자열로 '의예과' 를 포함한다.
 *   따라서 `isMedical` 이 먼저 true 가 되어 **치의/한의/수의 전용 분기(0.86/0.84/0.82)에
 *   도달하지 못한다.** 실제 결과:
 *     - 경희대 치의예과 → 0.90 (치의 분기 0.88 이 아님)
 *     - 경희대 한의예과 → 0.90 (한의 분기 0.88 이 아님)
 *     - 서울대 수의예과 → 0.90 / 건국대 수의예과 → 0.88 (수의 분기 0.82 가 아님)
 *   '치의학과'·'한의학과' 처럼 '의예과' 를 포함하지 않는 표기만 전용 분기에 도달한다.
 *   원본 그대로 둔다.
 *
 * NOTE(target-parity): topMed 목록의 '카톨릭대학교' 는 오타로 보인다(정상 표기는 '가톨릭대학교').
 *   그 결과 '가톨릭대학교 의예과' 는 0.90 이 아니라 0.88 로 떨어지고, 존재하지 않는
 *   '카톨릭대학교' 만 0.90 을 받는다. 원본 그대로 둔다.
 *
 * NOTE(target-parity): university/department 가 null·undefined 면 `.trim()` 에서 TypeError 가
 *   난다. 방어 코드가 없다. 원본 그대로 둔다.
 *
 * @param {string} university 대학명
 * @param {string} department 학과명
 * @returns {number} 배율
 */
export function getStudyMultiplier(university: string, department: string) {
  const u = university.trim();
  const d = department.trim();
  const has = (arr: string[]) => arr.some((x) => d.includes(x));
  const isMedical = has(["의예과", "의학부", "의과대학"]);
  const isDental = has(["치의학과", "치의예과"]);
  const isOriental = has([
    "한의예과",
    "한의예과/인문",
    "한의예과/자연",
    "한의학과",
  ]);
  const isPharm = has(["약학계열", "약학과", "약학부", "약학대학"]);
  const isVet = d.includes("수의예과");

  const topMed = [
    "울산대학교",
    "연세대학교",
    "성균관대학교",
    "중앙대학교",
    "고려대학교",
    "경희대학교",
    "서울대학교",
    "카톨릭대학교",
    "한양대학교",
  ];
  const topDental = ["경희대학교", "서울대학교", "연세대학교"];
  const topPharm = [
    "서울대학교",
    "경희대학교",
    "동국대학교",
    "성균관대학교",
    "연세대학교",
    "중앙대학교",
  ];

  if (isMedical && topMed.includes(u)) return 0.9;
  if (isMedical) return 0.88;
  if (isDental && topDental.includes(u)) return 0.88;
  if (isOriental && u === "경희대학교") return 0.88;
  if (isVet && u === "서울대학교") return 0.88;
  if (isPharm && topPharm.includes(u)) return 0.88;
  if (isDental) return 0.86;
  if (isOriental) return 0.84;
  if (isVet || isPharm) return 0.82;
  if (u === "서울대학교") return 0.78;
  if (["연세대학교", "고려대학교"].includes(u)) return 0.75;
  if (["서강대학교", "한양대학교", "성균관대학교"].includes(u)) return 0.72;
  if (
    ["중앙대학교", "경희대학교", "한국외국어대학교", "서울시립대학교"].includes(
      u,
    )
  )
    return 0.68;
  if (["건국대학교", "동국대학교", "홍익대학교", "이화여자대학교"].includes(u))
    return 0.63;
  if (["국민대학교", "숭실대학교", "세종대학교", "단국대학교"].includes(u))
    return 0.59;
  if (
    [
      "광운대학교",
      "명지대학교",
      "상명대학교",
      "가톨릭대학교",
      "숙명여자대학교",
    ].includes(u)
  )
    return 0.55;
  if (
    [
      "경북대학교",
      "부산대학교",
      "인하대학교",
      "경기대학교",
      "인천대학교",
    ].includes(u)
  )
    return 0.52;
  if (
    [
      "충남대학교",
      "경남대학교",
      "충북대학교",
      "전남대학교",
      "강원대학교",
      "고려대학교(세종)",
      "전북대학교",
      "가천대학교",
    ].includes(u)
  )
    return 0.49;
  return 0.46;
}

// ---------------------------------------------------------------------------
// 4) 하루 가용 학습시간 — IntakeForm.tsx:990-1003 (참조 구현)
// ---------------------------------------------------------------------------

/**
 * 하루치 생활 패턴에서 자습 가능 시간을 뽑는다. **원본의 요일별 입력 계약을 그대로 쓴다.**
 * 우리 온보딩(공통 스테퍼 4개)에는 이 계약에 맞는 입력이 없다 — 근사가 필요하면
 * `calcAvailableHoursApprox` 를 쓸 것. 이 함수는 파리티 기준(참조 구현)으로만 남긴다.
 *
 * 계산: (취침 − 기상) − 1.5(식사·정리) − 학교체류 + 등교전여유 − Σ(학원시간 + 1)
 *
 * NOTE(target-parity): 학교 항에서 `+ (schoolStart - wake)` 를 더한다. 등교 전 시간을
 *   자습 가능으로 되돌려주는 항인데, **기상이 등교보다 늦으면(schoolStart < wake) 음수가 되어
 *   오히려 가용시간을 깎는다.** clamp 이 없다. 원본 그대로 둔다.
 *
 * NOTE(target-parity): 학원 1건마다 `+1` 을 더 빼는데(이동시간 추정) 이 상수는 원본에
 *   설명이 없다. 학원 시각쌍이 유효할 때만 적용된다. 원본 그대로 둔다.
 *
 * NOTE(target-parity): `day` 가 null 이거나 `day.academies` 가 없으면 TypeError 가 난다.
 *   방어 코드가 없다. 원본 그대로 둔다.
 *
 * @param hasSchool 등교일 여부(원본 DAYS_CONFIG 상 월~금 true, 토·일 false)
 * @returns 0 이상, 소수 1자리
 */
export interface AcademySlot {
  start: string | number;
  end: string | number;
}

export interface DayPattern {
  wake: string | number;
  sleep: string | number;
  // 원본에는 없는 필드(신설, QA 행293) — calculateWeekSchedule 이 요일별 고정
  // DAYS_CONFIG 대신 이 값으로 등교일 여부를 결정할 수 있게 한다. 비어 있으면
  // calculateWeekSchedule 이 원본 그대로 DAYS_CONFIG(월~금 true)로 대체한다.
  hasSchool?: boolean;
  schoolStart?: string | number;
  schoolEnd?: string | number;
  academies: AcademySlot[];
}

// 학원 1건당 이동시간 공제(원본은 1h 고정, target/components/IntakeForm.tsx:997).
// QA 행293 — 사용자 결정(2026-09-02)으로 우리 앱은 0.5h 를 쓴다. 원본과 다른 상수이므로
// calcAvailableHours 세 번째 인자로만 넘긴다 — 함수 기본값(1)은 원본 파리티로 그대로
// 남겨 골든 테스트(1h 전제)를 건드리지 않는다. 상세: DIVERGENCE.md §3, §1 #5.
export const ACADEMY_COMMUTE_HOURS = 0.5;

export function calcAvailableHours(
  day: DayPattern,
  hasSchool: boolean,
  commuteHours = 1,
) {
  // parseFloat 는 string 만 받는다 — 원본은 string|number 를 그냥 넘겼고 parseFloat 내부에서
  // ToString 변환이 일어나므로(예: parseFloat(7) === parseFloat("7")) String() 래핑은 동작을 바꾸지 않는다.
  const wake = parseFloat(String(day.wake));
  const sleep = parseFloat(String(day.sleep));
  if (Number.isNaN(wake) || Number.isNaN(sleep) || sleep <= wake) return 0;

  let available = sleep - wake - 1.5;

  if (hasSchool) {
    const sStart = parseFloat(String(day.schoolStart));
    const sEnd = parseFloat(String(day.schoolEnd));
    if (!Number.isNaN(sStart) && !Number.isNaN(sEnd) && sEnd > sStart) {
      available -= sEnd - sStart;
      available += sStart - wake;
    }
  }

  for (const ac of day.academies) {
    const acStart = parseFloat(String(ac.start));
    const acEnd = parseFloat(String(ac.end));
    if (!Number.isNaN(acStart) && !Number.isNaN(acEnd) && acEnd > acStart)
      available -= acEnd - acStart + commuteHours;
  }

  return Math.max(0, Math.round(available * 10) / 10);
}

// ---------------------------------------------------------------------------
// 5) 주간 목표 산출 — IntakeForm.tsx:1005-1038
// ---------------------------------------------------------------------------

// 원본 DAYS_CONFIG — 월~금은 등교일, 토·일은 아님
const DAYS_CONFIG = [
  { key: "monday", hasSchool: true },
  { key: "tuesday", hasSchool: true },
  { key: "wednesday", hasSchool: true },
  { key: "thursday", hasSchool: true },
  { key: "friday", hasSchool: true },
  { key: "saturday", hasSchool: false },
  { key: "sunday", hasSchool: false },
];

/**
 * 요일 7행의 이상/최소 목표를 산출한다.
 * 기본값은 `가용시간 × 대학배율`이고, 학생이 이미 하고 있는 자습시간이 그보다 크면
 * 계산값을 버리고 `현재자습 +0.5 / +1.0` 으로 덮어쓴다.
 *
 * NOTE(target-parity): 배율표(§getStudyMultiplier)는 이상/최소 대학을 독립적으로 조회한다.
 *   **최소 목표 대학의 배율이 이상 목표 대학보다 높으면 목표가 역전된다**
 *   (예: 이상=한밭대 0.46, 최소=서울대 의예과 0.90 → ideal 2.5h < min 5.0h).
 *   검증·clamp 이 없다. 원본 그대로 둔다.
 *
 * NOTE(target-parity): 현재자습시간 오버라이드에 상한(clamp)이 없다. 현재자습이 가용시간과
 *   같거나 크면 목표가 **가용시간을 넘는다**(예: 가용 15.5h·현재자습 15h → min 15.5h, ideal 16h).
 *   원본 그대로 둔다.
 *
 * NOTE(target-parity): 원본은 React `useCallback` 이 `form` 을 클로저로 잡는다. 여기서는
 *   순수 함수로 만들기 위해 `form` 을 인자로 받는다(본문 로직은 동일).
 *
 * @returns 요일 7행
 */
export interface WeekScheduleForm {
  idealUniv: string;
  idealDept: string;
  minUniv: string;
  minDept: string;
  weekSchedule: Record<string, DayPattern>;
  selfStudyHours: Record<string, string | number>;
  // 신설(원본에 없음, QA 행293) — 학원 이동시간 공제. 생략하면 calcAvailableHours 기본값(1h,
  // 원본 파리티)을 그대로 쓴다. 기존 호출부(파이프라인 골든 테스트 등)는 이 필드를 넘기지
  // 않으므로 동작이 바뀌지 않는다.
  commuteHours?: number;
}

export function calculateWeekSchedule(form: WeekScheduleForm) {
  const idealMult = getStudyMultiplier(form.idealUniv, form.idealDept);
  const minMult = getStudyMultiplier(form.minUniv, form.minDept);
  const commuteHours = form.commuteHours ?? 1;

  const result: Record<string, { ideal: number; min: number }> = {};

  DAYS_CONFIG.forEach(({ key, hasSchool }) => {
    // 신설(원본에 없음) — 입력 요일에 hasSchool 이 명시돼 있으면 고정 DAYS_CONFIG(월~금)
    // 대신 그 값을 쓴다. QA 행293의 "학교 가는 날" 토글이 요일마다 독립이라 원본의
    // 고정 배정과 어긋나기 때문. 없으면 원본 그대로 DAYS_CONFIG 를 쓴다(파리티 유지).
    const dayHasSchool = form.weekSchedule[key]?.hasSchool ?? hasSchool;
    const avail = calcAvailableHours(
      form.weekSchedule[key]!,
      dayHasSchool,
      commuteHours,
    );
    const calcIdeal = Math.round(avail * idealMult * 10) / 10;
    const calcMin = Math.round(avail * minMult * 10) / 10;

    // 학생 자습시간 오버라이드 로직
    const studentTime = parseFloat(String(form.selfStudyHours[key])) || 0;
    let finalIdeal = calcIdeal;
    let finalMin = calcMin;

    if (studentTime > calcIdeal) {
      // 학생 자습시간이 계산된 이상 목표보다 높으면
      finalMin = Math.round((studentTime + 0.5) * 10) / 10;
      finalIdeal = Math.round((studentTime + 1.0) * 10) / 10;
    } else if (studentTime > calcMin) {
      // 학생 자습시간이 최소~이상 사이면
      finalMin = Math.round((studentTime + 0.5) * 10) / 10;
      if (studentTime + 0.5 > calcIdeal) {
        // +0.5가 이상을 초과하면 이상도 +1.0으로
        finalIdeal = Math.round((studentTime + 1.0) * 10) / 10;
      }
      // 아니면 이상은 원래 값 유지
    }
    // studentTime <= calcMin이면 계산값 그대로

    result[key] = { ideal: finalIdeal, min: finalMin };
  });

  return result;
}

// ---------------------------------------------------------------------------
// 6) 우리 온보딩용 근사 어댑터 — 원본에 없음 (신설)
// ---------------------------------------------------------------------------

/**
 * 우리 온보딩(시안 #10, 공통 스테퍼 4개)의 입력으로 하루 가용시간을 근사한다.
 * 원본 `calcAvailableHours` 의 요일별 계약(요일 7개 × 기상·취침·등하교 시각·학원 N쌍)은
 * 채택하지 않았으므로(사용자 확정), 아래 매핑으로 근사한다.
 *
 * 매핑 규칙 (docs/figma-goal/calc-spec.md §2.2-(8)):
 *   - 기상/취침: 공통 1벌을 전 요일에 동일 적용
 *   - 학교 체류: 지속시간(시간)으로 받고 등교일(월~금)에만 차감, 토·일은 0
 *   - 학원·과외: 지속시간 총량을 요일 구분 없이 전 요일 동일 차감
 *
 *   가용 = (취침 − 기상) − 학교체류(등교일만) − 학원시간
 *
 * 원본 대비 빠지는 항 3가지: ① 식사·정리 −1.5h ② 학원 1건당 이동시간 −1h
 * ③ 등교 전 자습 가능 시간 +(등교시각 − 기상). 그래서 결과가 어긋난다.
 *
 * **오차(clamp 이전 원식 기준)** = 근사 − 원본 = `1.5 + (유효 학원 건수 × 1) − 등교전자습시간`
 *   검증샘플(기상7·취침24·학교8~16·학원17~19 1건) → 근사 7.0h, 원본 5.5h, 오차 +1.5h.
 *   즉 학원이 많을수록 근사가 더 과대추정하고, 등교 전 여유가 클수록 과소추정 쪽으로 간다.
 *   (calc-spec.md 는 이 식의 부호를 뒤집어 `등교전자습 − 1.5 − 학원건수` 로 적었다. 문서가 틀렸다 —
 *    같은 문서의 수치 예시 +1.5h 및 결론 서술과도 어긋난다.)
 *
 * 원본과 맞춘 부분: 결과를 소수 1자리로 반올림하고 0 미만은 0으로 clamp 한다.
 * 입력이 비정상(NaN, 취침 ≤ 기상)이면 0을 돌려주는 것도 원본과 동일하다.
 *
 * 우리 온보딩 `dailySchedule` (DAILY_SCHEDULE_FIELDS 의 4개 키)
 * @param hasSchool 등교일 여부. 토·일은 false 로 부른다.
 * @returns 0 이상, 소수 1자리
 */
export interface DailyScheduleSteppers {
  wakeUpHour?: string | number;
  sleepHour?: string | number;
  schoolStayHours?: string | number;
  academyHours?: string | number;
}

export function calcAvailableHoursApprox(
  steppers: DailyScheduleSteppers | null | undefined,
  hasSchool = true,
) {
  const wake = parseFloat(String(steppers?.wakeUpHour));
  const sleep = parseFloat(String(steppers?.sleepHour));
  if (Number.isNaN(wake) || Number.isNaN(sleep) || sleep <= wake) return 0;

  let available = sleep - wake;

  if (hasSchool) {
    const stay = parseFloat(String(steppers?.schoolStayHours));
    if (!Number.isNaN(stay)) available -= stay;
  }

  const academy = parseFloat(String(steppers?.academyHours));
  if (!Number.isNaN(academy)) available -= academy;

  return Math.max(0, Math.round(available * 10) / 10);
}
