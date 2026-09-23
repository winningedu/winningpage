// POST /api/goal/intake
// Authorization: Bearer <access_token>
//
// 목표관리 온보딩(7단계 위저드) 1건을 저장하고, 확률 4종 · 일별 증분율 4종 ·
// 요일별 목표 학습시간을 산출해 학생 마스터 행을 만든다.
//
// 요청 바디는 GoalOnboardingContext state 를 그대로 받는다
// (GoalOnboardingContext.jsx:58-69 — 클라이언트가 이미 sessionStorage 에 이 모양으로 갖고 있다).
// 계약 전문은 docs/figma-goal/goal-schema-design.md §9-3.
//
// ── 원본(외부 target 앱)과 다르게 가는 지점 ────────────────────────────────
//  1. 원본은 전 API 가 무인증이고 `code` 문자열만 알면 타인 데이터를 쓸 수 있었다.
//     여기서는 profile_id 가 오직 auth.getUser(token).user.id 에서만 나온다.
//  2. 원본은 확률·주간목표를 **브라우저**가 계산해 보내고 서버가 그대로 저장했다
//     (IntakeForm.tsx:1172-1284 → student.mjs:2405-2533). 여기서는 클라이언트가
//     확률에 영향을 주는 값을 하나도 보내지 않는다 — 전부 이 파일이 서버에서
//     src/lib/goal/calc/ 를 호출해 만든다.
//  3. CORS 헤더를 붙이지 않는다. Authorization 은 CORS-safelisted 헤더가 아니라
//     크로스오리진 요청은 preflight 를 유발하고 OPTIONS 는 405 로 떨어진다 —
//     이것이 기본 방어선이다(§9-1).
//  4. "성적 없음" 특례(원본 naesinNone/mogoNone, IntakeForm.tsx:1176-1181)는 세 군데가
//     원본과 다르다. (a) 원본이 받는 0~100 원점수 대신 1~9 등급을 받는다 —
//     grade_conversions 변환표가 없고 우리는 전 구간이 단일 등급 스케일이다.
//     (b) 고2·고3 모의고사 "가상 3회차 입력"은 포팅하지 않았다 — 전 회차 없음이
//     이미 정상 경로라 막히지 않는다(정시 확률만 0). (c) 고1 치환 경로의
//     remainingMogo 를 보정한다(원본 결함 회피 — 아래 오버라이드 주석 참고).
//     학습성향 설문 6문항도 포팅하지 않았다 — 원본 서버에서 참조 0건이라 확률에
//     영향이 없다.
//
// 계산 모듈은 동결돼 있다(203개 테스트). 여기서 재구현하지 않고 import 만 한다.
// 특히 요일별 목표는 calculateWeekSchedule 을 그대로 호출한다 — 자습시간
// 오버라이드 규칙을 이 파일에 베껴 쓰면 두 벌이 갈린다(buildWeeklySchedule 주석 참고).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  fiveScaleToNine,
  middleAvgToNine,
} from "../../src/data/diagnosisGradeScale.js";
import {
  ACADEMY_COMMUTE_HOURS,
  buildInitialStudentState,
  calcJeongsiCompositeFE,
  calculateWeekSchedule,
  GRADE_PERCENTILE,
  getRemainingMogo,
  getRemainingNaesin,
  getSchoolCutType,
  kstYMD,
} from "../../src/lib/goal/calc/index.js";
import type { CutsInput } from "../../src/lib/goal/calc/pipeline.js";
import type { DayPattern } from "../../src/lib/goal/calc/schedule.js";
import { buildGoalDirectionReport } from "../_lib/goalDirectionReport.js";

import {
  appendProbabilityLog,
  buildStudentPayload,
  fetchProfileName,
  fetchStudentRow,
  fetchStudentStateRow,
  fetchTargetCuts,
  narrowGoalSession,
  openGoalSession,
  PAID_MESSAGE,
  saveGoalDirectionReport,
  upsertStudentRow,
} from "../_lib/goalRepo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// ---------------------------------------------------------------------------
// 온보딩 코드값 → 계산 모듈 리터럴 (§7-4)
//
// getSchoolCutType(primitives.js:43-47)은 정확히 '특목,자사,영재고' 또는 '특목고'
// 두 리터럴만 special 로 판정한다. '특목・자사고'(온보딩 라벨)나 'special'(코드값)을
// 그대로 저장하면 특목고 학생이 조용히 일반고 컷으로 계산된다.
// calcStudentBonusRates(bonus.js:113-122)의 학년 오프셋도 '고1'/'고2' 리터럴 비교다.
// ---------------------------------------------------------------------------

const SCHOOL_TYPE_MAP = {
  general: "일반고",
  special: "특목고", // 미결 Q6 — '특목,자사,영재고' 와 둘 다 special 로 판정된다
};

// 중학교·초등학교는 grade_conversions 변환표가 필요해 아직 지원하지 않는다(§7-5, 미결 Q7).
const UNSUPPORTED_SCHOOL_TYPES = ["middle", "elementary"];

const GRADE_MAP = {
  g1: "고1",
  g2: "고2",
  g3: "고3",
};

// NAESIN_FLOW/MOCK_FLOW 항목의 gradeLabel과 학생의 실제 학년(gradeLabel)을 비교해
// "아직 보지 않은 미래 시험"을 걸러내는 순위표.
const GRADE_RANK: Record<string, number> = { 고1: 0, 고2: 1, 고3: 2 };

// QA 행290・291 재설계(qa3-held-high-design.md §2・§3) — "현재 학년 4회차 고정"에서 고1~고3
// 전 시퀀스로 확장했다. key/gradeLabel/examLabel은 src/components/goal/onboarding/
// onboardingOptions.ts NAESIN_EXAM_FLOW/MOCK_FLOW와 값이 정확히 같아야 한다(서버가 UI가
// 보낸 키를 화이트리스트로 검증하므로 어긋나면 정상 입력도 거절된다) — 다만 이 파일은
// api/ 계층이 src/components/(React) 를 import하지 않는 관례를 유지하기 위해 사본을 둔다.
// gradeLabel+examLabel 조합은 getRemainingNaesin/getRemainingMogo 순번 표(primitives.js)의
// 키와 글자 단위로 일치해야 한다 — 그 표를 재구현하지 않고 그대로 재사용한다.
export const NAESIN_FLOW = [
  { key: "g1_s1mid", gradeLabel: "고1", examLabel: "1학기 중간" },
  { key: "g1_s1final", gradeLabel: "고1", examLabel: "1학기 기말" },
  { key: "g1_s2mid", gradeLabel: "고1", examLabel: "2학기 중간" },
  { key: "g1_s2final", gradeLabel: "고1", examLabel: "2학기 기말" },
  { key: "g2_s1mid", gradeLabel: "고2", examLabel: "1학기 중간" },
  { key: "g2_s1final", gradeLabel: "고2", examLabel: "1학기 기말" },
  { key: "g2_s2mid", gradeLabel: "고2", examLabel: "2학기 중간" },
  { key: "g2_s2final", gradeLabel: "고2", examLabel: "2학기 기말" },
  { key: "g3_s1mid", gradeLabel: "고3", examLabel: "1학기 중간" },
  { key: "g3_s1final", gradeLabel: "고3", examLabel: "1학기 기말" },
  { key: "g3_s2mid", gradeLabel: "고3", examLabel: "2학기 중간" },
  { key: "g3_s2final", gradeLabel: "고3", examLabel: "2학기 기말" },
];

const NAESIN_FLOW_BY_KEY = Object.fromEntries(
  NAESIN_FLOW.map((exam) => [exam.key, exam]),
);

// 내신 과목군 6종 — target-app-analysis.md §4.1 NAESIN_SUBJECT_GROUPS와 같은 키.
const NAESIN_GROUP_KEYS = [
  "korean",
  "math",
  "english",
  "social_history",
  "science",
  "second_language",
];

// 고3 5・7모가 포함된 학년별 전체 시퀀스(14회). MOCK_ROUNDS(4회 고정)를 대체한다 — Q9(고3
// remain_mogo 과대 산출)가 이번 재설계로 해소된다.
export const MOCK_FLOW = [
  { key: "g1_mar", gradeLabel: "고1", examLabel: "3모" },
  { key: "g1_jun", gradeLabel: "고1", examLabel: "6모" },
  { key: "g1_sep", gradeLabel: "고1", examLabel: "9모" },
  { key: "g1_oct", gradeLabel: "고1", examLabel: "10모" },
  { key: "g2_mar", gradeLabel: "고2", examLabel: "3모" },
  { key: "g2_jun", gradeLabel: "고2", examLabel: "6모" },
  { key: "g2_sep", gradeLabel: "고2", examLabel: "9모" },
  { key: "g2_oct", gradeLabel: "고2", examLabel: "10모" },
  { key: "g3_mar", gradeLabel: "고3", examLabel: "3모" },
  { key: "g3_may", gradeLabel: "고3", examLabel: "5모" },
  { key: "g3_jun", gradeLabel: "고3", examLabel: "6모" },
  { key: "g3_jul", gradeLabel: "고3", examLabel: "7모" },
  { key: "g3_sep", gradeLabel: "고3", examLabel: "9모" },
  { key: "g3_oct", gradeLabel: "고3", examLabel: "10모" },
];

const MOCK_FLOW_BY_KEY = Object.fromEntries(
  MOCK_FLOW.map((round) => [round.key, round]),
);

const MOCK_SUBJECTS = ["kor", "math", "tam1", "tam2"];

// ---------------------------------------------------------------------------
// "성적 없음" 특례의 잔여 회차 오버라이드 표
//
// 원본 getNaesinNoneRemaining / getMogoNoneRemaining(IntakeForm.tsx:514-523)을 옮긴 것.
// 의미는 "작년 마지막 시험까지는 본 것으로 친다"이고, 값은 그 산술적 등가물이다 —
//   내신(총 10회, getRemainingNaesin 표 primitives.js:59-72):
//     고1 → 직전 고교 시험이 아예 없음                → 10 - 0 = 10 (전량)
//     고2 → 직전이 '고1_2학기 기말'(순번 4)  → 10 - 4 = 6
//     고3 → 직전이 '고2_2학기 기말'(순번 8)  → 10 - 8 = 2
//   모의(총 14회, getRemainingMogo 표 primitives.js:88-103):
//     고1 → 직전 고교 모의고사가 아예 없음              → 14 - 0 = 14 (전량)
//     고2 → 직전이 '고1_10모'(순번 4)        → 14 - 4 = 10
//     고3 → 직전이 '고2_10모'(순번 8)        → 14 - 8 = 6
//
// 고1 항목은 원본에 없었다(IntakeForm.tsx:1268-1269 grade!=='고1' 가드) — 원본 서버가
// isPreHighStudent 이면 remainNaesin 을 조건 분기로 무조건 0 덮어써서 고1 오버라이드가
// 애초에 무의미했기 때문이다(원본 내부 비대칭, calc/DIVERGENCE.md #1). 우리는 그 가드를
// pipeline.js:219-222 에서 "오버라이드가 없을 때만" 으로 좁혀 세 학년 모두 오버라이드가
// 실제로 적용되게 했다(사용자 승인) — 그래서 여기 표도 고1 을 채운다.
const NAESIN_NONE_REMAINING = { 고1: 10, 고2: 6, 고3: 2 };
const MOGO_NONE_REMAINING = { 고1: 14, 고2: 10, 고3: 6 };

// onboardingOptions.js:64-72 WEEKDAY_OPTIONS ↔ VIRTUAL_DAY_NAMES(schedule.js:18-26).
// hasSchool 은 더 이상 여기서 고정하지 않는다(QA 행293) — 요일별 "학교 가는 날" 토글이
// 사용자 입력이라 body.weekSchedule[short].hasSchool 이 정본이다. short/long 매핑 용도로만
// 남긴다.
const WEEKDAYS = [
  { short: "mon", long: "monday", label: "월요일" },
  { short: "tue", long: "tuesday", label: "화요일" },
  { short: "wed", long: "wednesday", label: "수요일" },
  { short: "thu", long: "thursday", label: "목요일" },
  { short: "fri", long: "friday", label: "금요일" },
  { short: "sat", long: "saturday", label: "토요일" },
  { short: "sun", long: "sunday", label: "일요일" },
];

// onboardingOptions.js WEEK_SCHEDULE_* 상수와 글자 단위로 같다(QA 행293, 원본 계약
// target/components/IntakeForm.tsx:1814-1920 "0~30, 자정 넘김은 24 가산").
const WEEK_SCHEDULE_WAKE_MAX = 24;
const WEEK_SCHEDULE_SLEEP_MAX = 30;
const WEEK_SCHEDULE_SCHOOL_TIME_MAX = 30;
const WEEK_SCHEDULE_ACADEMY_TIME_MAX = 30;
const WEEK_SCHEDULE_MAX_ACADEMIES = 5;

const NAME_MAX_LENGTH = 100;
// QA 행290 — 0.1시간 단위 직접 입력(SliderRow.tsx round2) 회귀 테스트가 참조하도록 export.
export const STUDY_HOURS_MAX = 24;

// ---------------------------------------------------------------------------
// 입력 검증 — 클라이언트 값을 하나도 믿지 않는다
// ---------------------------------------------------------------------------

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 숫자로 해석해도 되는 원시값인가.
 *
 * ⚠ 이 가드가 없으면 검증기(Number 기반)와 저장·소비(clean → 문자열)의 정의역이
 *   갈린다. Number(true) = 1 이라 boolean 이 검증을 통과하는데 clean(true) = "true"
 *   라 이후 Number("true") = NaN 이 되고, 그 NaN 이 두 갈래로 샌다.
 *     (a) 모의고사: gradeToPercentile 이 GRADE_PERCENTILE[NaN] → undefined 를 읽어
 *         TypeError → intake 최상위 catch → 500. 설계된 400 이 아니다.
 *     (b) 내신:     round1 이 NaN 을 0 으로 접어 current_score 가 0 이 되고
 *         (컬럼 주석은 1~9 등급이라고 명시한다), applyPreHighGradePenalty 의
 *         clamp(1, 9)가 이를 **1등급(최상위)** 으로 올린다 — 아래 "전 회차 없음"
 *         거절(NAESIN_ROUNDS.every)이 막으려는 바로 그 경로가 재개통된다.
 *   객체·배열·boolean·null 을 원천 차단하고, 통과한 값은 normalizeGrade 로
 *   숫자에서 되짚어 만든 문자열만 쓴다(clean 을 쓰지 않는다).
 */
function isNumericInput(raw: unknown) {
  return typeof raw === "number" || typeof raw === "string";
}

// Step4Naesin.jsx:8-11 / Step5MockExam.jsx:8-11 의 isValidGrade 와 동일한 규칙.
// (빈 문자열·공백은 Number('') = 0 이라 아래 범위 검사에서 걸린다.)
function isValidGrade(raw: unknown) {
  if (!isNumericInput(raw)) return false;
  const num = Number(raw);
  return Number.isFinite(num) && num >= 1 && num <= 9;
}

/**
 * isValidGrade 를 통과한 값 → 정규화된 숫자 문자열.
 * clean() 을 쓰면 검증(Number)과 저장(String)의 정의역이 갈리므로 쓰지 않는다.
 * 여기서 한 번 숫자로 접어 두면 이후 소비 지점이 전부 같은 값을 본다 —
 * deriveNaesin 의 Number(), gradeToPercentile 의 Number(),
 * calcJeongsiCompositeFE 의 parseFloat(s.eng)(jeongsi.js:205).
 */
function normalizeGrade(raw: unknown) {
  return String(Number(raw));
}

// QA 행290 — 정수만 받는지 확인 요청이 있었으나, 이미 Number.isInteger 제약이 없어
// 0.1시간 단위(round2) 입력을 그대로 통과시킨다. export는 그 사실을 회귀 테스트로
// 고정하기 위함(intake.studyHours.test.ts).
export function isValidHours(raw: unknown, max: number) {
  if (!isNumericInput(raw)) return false;
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 && num <= max;
}

// QA 행290・291 재설계 — priorNaesinGrade(0~100 또는 1~9)・naesin.overall(1~naesinScale)・
// mock 백분위(0~100) 세 군데가 각자 다른 정의역의 숫자 하나만 검증하면 되는 공통 패턴이라
// isValidHours(하한 0 고정)를 일반화한다.
//
// ⚠ 로컬 E2E 버그 — isNumericInput만으로는 부족하다. Number('') === 0 이라 하한이 0인
// 도메인(모의고사 백분위 0~100, 고1 priorNaesinGrade 0~100)에서는 "미입력"(빈 문자열,
// 백분위 칩을 안 고른 기본값)이 조용히 유효한 0으로 통과했다. 그 결과 deriveMogo가
// gradeToPercentile 밴드 중앙값 대체 경로를 아예 타지 않고 pct=0을 그대로 써서
// currentMogo가 크게 낮게 나왔다(재현: 국어만 칩 선택, 나머지 3과목 pct 미선택 →
// 종합 백분위 29.67, 기대값 86.5). clean()으로 "실제 값이 있는지"까지 확인한다.
function isInRange(raw: unknown, min: number, max: number) {
  if (!isNumericInput(raw)) return false;
  if (clean(raw) === "") return false;
  const num = Number(raw);
  return Number.isFinite(num) && num >= min && num <= max;
}

// "고2 2학기 기말" / "고3 3모" 형태 — 에러 메시지·라벨 매칭에 쓴다.
function flowLabel(entry: { gradeLabel: string; examLabel: string }) {
  return `${entry.gradeLabel} ${entry.examLabel}`;
}

// unwrapped {status, body}를 돌려준다 — 호출부가 항상 `return { error: fail(...) }`
// 형태의 object literal로 감싸야 TS가 형제 프로퍼티를 undefined로 자동 추론해
// validated.error / validated.input 접근이 좁혀진다(순수 타입 추론 편의, 런타임
// JSON 응답 바이트는 이전과 동일 — { error: { status, body: { detail } } }).
function fail(detail: string) {
  return { status: 400, body: { detail } };
}

export function validateTarget(value: unknown, label: string) {
  if (!isPlainObject(value))
    return { error: fail(`${label} 정보가 올바르지 않습니다.`) };

  const university = clean(value.university);
  const department = clean(value.department);

  if (!university) return { error: fail(`${label} 대학을 선택해 주세요.`) };
  if (
    university.length > NAME_MAX_LENGTH ||
    department.length > NAME_MAX_LENGTH
  ) {
    return { error: fail(`${label} 대학·학과 이름이 너무 깁니다.`) };
  }

  return { value: { university, department } };
}

/**
 * 내신 성적 검증 — validateIntakeBody의 "── 내신 ──" 절을 그대로 뗀 것이다.
 * 내 정보 수정(부분 업데이트, api/goal/intake-update.ts)이 온보딩과 완전히 같은
 * 규칙으로 내신을 재검증해야 해서 별도 함수로 공유한다(중복 구현 금지 — 두 벌이
 * 되면 QA 행290 재설계 규칙이 갈린다). gradeLabel(고1/고2/고3)은 호출부가 이미
 * 확정해(GRADE_MAP 통과 또는 기존 학생 행) 넘긴다.
 */
export function validateNaesinInput(naesinBody: unknown, gradeLabel: string) {
  if (!isPlainObject(naesinBody))
    return { error: fail("내신 성적이 올바르지 않습니다.") };

  const naesinScale = gradeLabel === "고3" ? 9 : 5;

  const naesinLastExamKey = clean(naesinBody.lastExam);
  const naesinAllNone = naesinLastExamKey === "";
  const selectedNaesinExam = naesinAllNone
    ? null
    : NAESIN_FLOW_BY_KEY[naesinLastExamKey];

  if (!naesinAllNone) {
    if (!selectedNaesinExam) {
      return {
        error: fail("마지막으로 본 내신 시험을 올바르게 선택해 주세요."),
      };
    }
    if (
      (GRADE_RANK[selectedNaesinExam.gradeLabel] ?? 0) >
      (GRADE_RANK[gradeLabel] ?? 0)
    ) {
      return { error: fail("선택한 시험이 현재 학년보다 앞섭니다.") };
    }
  }

  // "전 시험 없음" 특례 — 평균을 낼 시험이 없어 currentScore 가 0 이 되는 것을 막는다
  // (0 이면 applyPreHighGradePenalty clamp(1,9)가 1등급(최상위)으로 접어버린다, 구판과
  // 동일한 이유). 원본과 같이 고1은 중학교 평균 **원점수**(0~100, middleAvgToNine으로
  // 9등급 환산), 고2・고3은 이전 학년까지의 평균 **등급**(1~9, 9등급제 그대로 — 기존
  // priorNaesinGrade 흐름 유지)을 받는다.
  let priorNaesinGrade = "";
  let naesinOverall = "";

  if (naesinAllNone) {
    const isScoreInput = gradeLabel === "고1";
    if (
      !isInRange(
        naesinBody.priorNaesinGrade,
        isScoreInput ? 0 : 1,
        isScoreInput ? 100 : 9,
      )
    ) {
      return {
        error: fail(
          isScoreInput
            ? "중학교 내신 평균 점수를 0~100 사이로 입력해 주세요."
            : "내신 성적이 없다면 이전까지의 내신 평균 등급을 1~9 사이로 입력해 주세요.",
        ),
      };
    }
    priorNaesinGrade = normalizeGrade(naesinBody.priorNaesinGrade);
  } else {
    if (!isInRange(naesinBody.overall, 1, naesinScale)) {
      return {
        error: fail(`내신 평균 등급은 1~${naesinScale} 사이여야 합니다.`),
      };
    }
    naesinOverall = normalizeGrade(naesinBody.overall);
  }

  // 최근 시험별 과목군 평균 — 선택 사항(리포트 유닛 입력용, 온보딩 진행을 막지 않는다).
  // 표시 창(선택 시험 포함 역순 최대 3개, Step4Naesin.tsx recentExams와 동일 규칙) 밖의
  // 시험은 무시한다 — mockRounds와 같은 이유(GoalOnboardingContext가 NAESIN_EXAM_FLOW
  // 12개 키를 전부 빈 객체로 들고 있고, lastExam을 바꿔도 이전에 입력해 둔 다른 시험의
  // 데이터를 지우지 않는다 — buildInitialNaesinExams 주석 참고). FLOW 밖 키・과목군 밖
  // 키도 조용히 무시하고(화이트리스트 밖 데이터를 저장하지 않는다), 군 평균이 없는 군도
  // 조용히 건너뛴다("빈 군은 저장 제외" 규칙).
  const naesinWindowKeys = new Set<string>();
  if (!naesinAllNone) {
    const lastIndex = NAESIN_FLOW.findIndex((e) => e.key === naesinLastExamKey);
    if (lastIndex !== -1) {
      for (const entry of NAESIN_FLOW.slice(
        Math.max(0, lastIndex - 2),
        lastIndex + 1,
      )) {
        naesinWindowKeys.add(entry.key);
      }
    }
  }

  const naesinExams: {
    key: string;
    groups: Record<
      string,
      { avg: number; subjects: { name: string; grade: number }[] }
    >;
  }[] = [];
  const rawNaesinExams = isPlainObject(naesinBody.exams)
    ? naesinBody.exams
    : {};
  for (const [examKey, examValue] of Object.entries(rawNaesinExams)) {
    if (!naesinWindowKeys.has(examKey)) continue; // 창 밖은 무조건 무시(FLOW 밖 키도 자동 제외).
    if (!isPlainObject(examValue) || !isPlainObject(examValue.groups)) continue;

    const groups: Record<
      string,
      { avg: number; subjects: { name: string; grade: number }[] }
    > = {};
    for (const groupKey of NAESIN_GROUP_KEYS) {
      const groupValue = examValue.groups[groupKey];
      if (!isPlainObject(groupValue) || !isValidGrade(groupValue.avg)) continue;

      const subjects: { name: string; grade: number }[] = [];
      if (Array.isArray(groupValue.subjects)) {
        for (const subject of groupValue.subjects) {
          if (!isPlainObject(subject)) continue;
          const name = clean(subject.name);
          if (!name || name.length > NAME_MAX_LENGTH) continue;
          if (!isValidGrade(subject.grade)) continue;
          subjects.push({ name, grade: Number(normalizeGrade(subject.grade)) });
        }
      }
      groups[groupKey] = {
        avg: Number(normalizeGrade(groupValue.avg)),
        subjects,
      };
    }
    if (Object.keys(groups).length > 0)
      naesinExams.push({ key: examKey, groups });
  }

  return {
    value: {
      naesinScale,
      naesinLastExamKey,
      naesinAllNone,
      selectedNaesinExam,
      priorNaesinGrade,
      naesinOverall,
      naesinExams,
    },
  };
}

/**
 * 모의고사 성적 검증 — validateIntakeBody의 "── 모의고사 ──" 절을 그대로 뗀 것이다.
 * validateNaesinInput과 같은 이유로 내 정보 수정과 공유한다.
 */
export function validateMockExamInput(
  mockExamBody: unknown,
  gradeLabel: string,
) {
  if (!isPlainObject(mockExamBody))
    return { error: fail("모의고사 성적이 올바르지 않습니다.") };

  const mockLastRoundKey = clean(mockExamBody.lastRound);
  const mockAllNone = mockLastRoundKey === "";
  const selectedMockRound = mockAllNone
    ? null
    : MOCK_FLOW_BY_KEY[mockLastRoundKey];

  if (!mockAllNone) {
    if (!selectedMockRound) {
      return {
        error: fail("마지막으로 본 모의고사를 올바르게 선택해 주세요."),
      };
    }
    if (
      (GRADE_RANK[selectedMockRound.gradeLabel] ?? 0) >
      (GRADE_RANK[gradeLabel] ?? 0)
    ) {
      return { error: fail("선택한 모의고사가 현재 학년보다 앞섭니다.") };
    }
  }

  const mockTrack =
    mockExamBody.track === "과탐" || mockExamBody.track === "사탐"
      ? mockExamBody.track
      : "";
  if (!mockAllNone && !mockTrack) {
    return { error: fail("탐구 선택 과목(과탐/사탐)을 골라 주세요.") };
  }

  // 로컬 E2E 버그 — "표시 창"(선택 회차 포함 역순 최대 3개, Step5MockExam.tsx
  // recentRounds와 동일 규칙) 밖의 회차는 클라이언트가 무엇을 보내든(빈 값이든, 이전에
  // 다른 lastRound를 고르며 남은 스테일 데이터든) 무시한다 — 학생이 "고3 10모"를 고르고
  // 입력했다가 마음을 바꿔 "고2 6모"로 다시 고르면, GoalOnboardingContext는 고3 회차
  // 데이터를 지우지 않고 그대로 들고 있는다(다른 회차를 다시 고를 때 입력이 사라지지
  // 않게 하려는 설계, buildInitialMockRounds 주석 참고) — 그 남은 데이터가 조용히
  // 저장되는 걸 여기서 막는다.
  const mockWindowKeys = new Set<string>();
  if (!mockAllNone) {
    const lastIndex = MOCK_FLOW.findIndex((r) => r.key === mockLastRoundKey);
    if (lastIndex !== -1) {
      for (const entry of MOCK_FLOW.slice(
        Math.max(0, lastIndex - 2),
        lastIndex + 1,
      )) {
        mockWindowKeys.add(entry.key);
      }
    }
  }

  // 값이 하나라도 있는 회차는 국/수/영/탐구1/탐구2 전부 채워야 한다(부분 회차는 종합
  // 백분위 계산을 왜곡한다 — buildMogoScores 주석 참고).
  const mockRounds: Record<
    string,
    {
      kor: { grade: string; pct: number | null };
      math: { grade: string; pct: number | null };
      eng: { grade: string };
      tam1: { grade: string; pct: number | null };
      tam2: { grade: string; pct: number | null };
    }
  > = {};
  // MOCK_FLOW(학년 순) 순서로 순회한다 — Object.entries(body 원본)는 클라이언트가 보낸
  // JSON 키 순서를 그대로 따르는데, calcJeongsiCompositeFE(jeongsi.js:195-212)의 영어
  // 점수는 "마지막으로 값이 있는 회차가 덮어쓴다"는 규칙이 Object.values() 순회 순서에
  // 의존한다 — 삽입 순서가 시간순이 아니면 오래된 회차의 영어 등급이 더 최근 회차를
  // 덮어쓸 수 있다.
  const rawMockRounds = isPlainObject(mockExamBody.rounds)
    ? mockExamBody.rounds
    : {};
  for (const flowEntry of MOCK_FLOW) {
    const roundKey = flowEntry.key;
    if (!mockWindowKeys.has(roundKey)) continue; // 창 밖은 무조건 무시(FLOW 밖 키도 자동 제외).
    const roundValue = rawMockRounds[roundKey];
    if (!isPlainObject(roundValue)) continue;

    // "값이 있다"의 정의 — isNumericInput만으로는 grade:""(미입력 기본값)도 "문자열이니
    // 숫자로 해석해도 되는 값"으로 통과시켜, 완전히 빈 회차까지 "값이 있다"고 오판했다
    // (로컬 E2E에서 재현된 400의 원인 — GoalOnboardingContext가 MOCK_FLOW 14개 키를
    // 전부 빈 객체로 채워 두므로, 이 가드 없이는 창 안의 빈 회차조차 5과목 필수 검증에
    // 걸린다). clean()으로 실제 비어있지 않은지까지 확인한다.
    const hasAnyInput =
      MOCK_SUBJECTS.some((subject) => {
        const entry = roundValue[subject];
        return isPlainObject(entry) && clean(entry.grade) !== "";
      }) ||
      (isPlainObject(roundValue.eng) && clean(roundValue.eng.grade) !== "");
    if (!hasAnyInput) continue; // 완전히 빈 회차는 저장하지 않는다(선택 회차 포함).

    const label = flowLabel(flowEntry);
    const round: Record<string, unknown> = {};
    for (const subjectKey of MOCK_SUBJECTS) {
      const entry = roundValue[subjectKey];
      if (!isPlainObject(entry) || !isValidGrade(entry.grade)) {
        return {
          error: fail(
            `모의고사 ${label} 등급은 5과목 모두 1~9 사이여야 합니다.`,
          ),
        };
      }
      const pct = isInRange(entry.pct, 0, 100)
        ? Math.round(Number(entry.pct))
        : null;
      round[subjectKey] = { grade: normalizeGrade(entry.grade), pct };
    }
    if (!isPlainObject(roundValue.eng) || !isValidGrade(roundValue.eng.grade)) {
      return {
        error: fail(`모의고사 ${label} 등급은 5과목 모두 1~9 사이여야 합니다.`),
      };
    }
    round.eng = { grade: normalizeGrade(roundValue.eng.grade) };

    mockRounds[roundKey] = round as (typeof mockRounds)[string];
  }

  // 마지막 회차는 currentMogo/remain_mogo 가 실제로 쓰는 값이다(리포트・확률 기준) — 없음이
  // 아니면 반드시 채워져 있어야 한다. 참고용으로만 보여준 이전 회차 2개는 선택 입력이다.
  if (!mockAllNone && !mockRounds[mockLastRoundKey]) {
    return {
      error: fail(
        "마지막으로 선택한 모의고사의 5개 과목 등급을 모두 입력해 주세요.",
      ),
    };
  }

  return {
    value: {
      mockLastRoundKey,
      mockAllNone,
      selectedMockRound,
      mockTrack,
      mockRounds,
    },
  };
}

/**
 * 시각(time-of-day) 값 검증 — isValidHours 와 달리 원본 계약대로 0~30 범위(자정 넘김은
 * 24 초과로 표현)까지 허용한다. isNumericInput 가드 사유는 isValidGrade 와 같다.
 */
function isValidTimeOfDay(raw: unknown, max: number) {
  if (!isNumericInput(raw)) return false;
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 && num <= max;
}

/**
 * 요일 1행(하루 일정) 검증 — QA 행293. schedule.ts DayPattern 계약과 같은 모양으로
 * 정규화해 돌려준다(buildWeeklySchedule 이 그대로 calculateWeekSchedule 에 투입한다).
 */
// QA 행293 — intake.weekSchedule.test.ts 회귀 테스트가 참조하도록 export.
export function validateWeekScheduleDay(raw: unknown, dayLabel: string) {
  if (!isPlainObject(raw))
    return { error: fail(`${dayLabel} 일정이 올바르지 않습니다.`) };

  if (!isValidTimeOfDay(raw.wake, WEEK_SCHEDULE_WAKE_MAX)) {
    return {
      error: fail(
        `${dayLabel} 기상 시각은 0~${WEEK_SCHEDULE_WAKE_MAX} 사이여야 합니다.`,
      ),
    };
  }
  if (!isValidTimeOfDay(raw.sleep, WEEK_SCHEDULE_SLEEP_MAX)) {
    return {
      error: fail(
        `${dayLabel} 취침 시각은 0~${WEEK_SCHEDULE_SLEEP_MAX} 사이여야 합니다.`,
      ),
    };
  }
  const wake = Number(raw.wake);
  const sleep = Number(raw.sleep);
  if (sleep <= wake) {
    return {
      error: fail(`${dayLabel} 취침 시각은 기상 시각보다 늦어야 합니다.`),
    };
  }

  if (raw.hasSchool !== true && raw.hasSchool !== false) {
    return {
      error: fail(`${dayLabel} 등교 여부가 올바르지 않습니다.`),
    };
  }
  const hasSchool = raw.hasSchool;

  // schoolStart/schoolEnd 는 hasSchool 이 false 여도 값 자체는 그대로 저장한다
  // (Step7 토글을 다시 켰을 때 이전 입력을 잃지 않기 위해, GoalOnboardingContext.tsx
  // DayScheduleInput 주석 참고) — 검증도 hasSchool 과 무관하게 항상 한다.
  if (
    !isValidTimeOfDay(raw.schoolStart, WEEK_SCHEDULE_SCHOOL_TIME_MAX) ||
    !isValidTimeOfDay(raw.schoolEnd, WEEK_SCHEDULE_SCHOOL_TIME_MAX)
  ) {
    return { error: fail(`${dayLabel} 등·하교 시각이 올바르지 않습니다.`) };
  }
  const schoolStart = Number(raw.schoolStart);
  const schoolEnd = Number(raw.schoolEnd);
  if (hasSchool && schoolEnd <= schoolStart) {
    return {
      error: fail(`${dayLabel} 하교 시각은 등교 시각보다 늦어야 합니다.`),
    };
  }

  if (
    !Array.isArray(raw.academies) ||
    raw.academies.length > WEEK_SCHEDULE_MAX_ACADEMIES
  ) {
    return {
      error: fail(
        `${dayLabel} 학원 일정은 최대 ${WEEK_SCHEDULE_MAX_ACADEMIES}개까지 입력할 수 있습니다.`,
      ),
    };
  }

  const academies: { start: number; end: number }[] = [];
  for (const slot of raw.academies) {
    if (
      !isPlainObject(slot) ||
      !isValidTimeOfDay(slot.start, WEEK_SCHEDULE_ACADEMY_TIME_MAX) ||
      !isValidTimeOfDay(slot.end, WEEK_SCHEDULE_ACADEMY_TIME_MAX)
    ) {
      return { error: fail(`${dayLabel} 학원 시각이 올바르지 않습니다.`) };
    }
    const start = Number(slot.start);
    const end = Number(slot.end);
    if (end <= start) {
      return {
        error: fail(
          `${dayLabel} 학원 하원 시각은 등원 시각보다 늦어야 합니다.`,
        ),
      };
    }
    academies.push({ start, end });
  }

  return {
    value: { wake, sleep, hasSchool, schoolStart, schoolEnd, academies },
  };
}

/** 요청 바디 전체를 화이트리스트로 검증하고 정규화한다. */
export function validateIntakeBody(body: unknown) {
  if (!isPlainObject(body))
    return { error: fail("요청 본문이 올바르지 않습니다.") };

  // ── 학교 유형 · 학년 ──────────────────────────────────────────────────
  const schoolType = clean(body.schoolType);

  if (UNSUPPORTED_SCHOOL_TYPES.includes(schoolType)) {
    return {
      error: {
        status: 501,
        body: {
          detail: "중학교·초등학교 목표관리는 아직 준비 중입니다.",
          reason: "grade_unsupported",
        },
      },
    };
  }

  if (!SCHOOL_TYPE_MAP[schoolType])
    return { error: fail("학교 유형을 선택해 주세요.") };

  const grade = clean(body.grade);
  if (!GRADE_MAP[grade]) return { error: fail("학년을 선택해 주세요.") };

  // ── 목표 대학 ────────────────────────────────────────────────────────
  const idealTarget = validateTarget(body.upperUniversity, "이상 목표");
  if (idealTarget.error) return { error: idealTarget.error };

  const minTarget = validateTarget(body.lowerUniversity, "최소 목표");
  if (minTarget.error) return { error: minTarget.error };

  // ── 내신 ─────────────────────────────────────────────────────────────
  // QA 행290 재설계(qa3-held-high-design.md §2) 로직은 validateNaesinInput으로
  // 추출했다(내 정보 수정 부분 업데이트와 공유, 중복 구현 금지 — validateNaesinInput
  // JSDoc 참고).
  const gradeLabel = GRADE_MAP[grade]; // 위에서 이미 GRADE_MAP[grade] 존재를 검증했다.
  const naesinResult = validateNaesinInput(body.naesin, gradeLabel);
  if (naesinResult.error) return { error: naesinResult.error };
  const {
    naesinScale,
    naesinLastExamKey,
    naesinAllNone,
    selectedNaesinExam,
    priorNaesinGrade,
    naesinOverall,
    naesinExams,
  } = naesinResult.value;

  // ── 모의고사 ─────────────────────────────────────────────────────────
  // QA 행291 재설계(qa3-held-high-design.md §3) 로직은 validateMockExamInput으로
  // 추출했다(이유는 위 내신과 동일).
  const mockResult = validateMockExamInput(body.mockExam, gradeLabel);
  if (mockResult.error) return { error: mockResult.error };
  const {
    mockLastRoundKey,
    mockAllNone,
    selectedMockRound,
    mockTrack,
    mockRounds,
  } = mockResult.value;

  // ── 자습 시간 · 하루 일과 ────────────────────────────────────────────
  if (!isPlainObject(body.studyHours))
    return { error: fail("요일별 자습 시간이 올바르지 않습니다.") };

  const studyHours: Record<string, number> = {};
  for (const { short } of WEEKDAYS) {
    if (!isValidHours(body.studyHours[short], STUDY_HOURS_MAX)) {
      return { error: fail("요일별 자습 시간은 0~24 사이여야 합니다.") };
    }
    studyHours[short] = Number(body.studyHours[short]);
  }

  // QA 행293 — 이전 버전의 단일 세트 4필드(dailySchedule)는 더 이상 받지 않는다.
  // weekSchedule 이 없는 요청(구버전 클라이언트가 여전히 dailySchedule 을 보내는 경우
  // 포함)은 이 isPlainObject 체크에서 그대로 400 으로 떨어진다.
  if (!isPlainObject(body.weekSchedule))
    return { error: fail("하루 일정이 올바르지 않습니다.") };

  const weekSchedule: Record<string, DayPattern> = {};
  for (const { short, long, label } of WEEKDAYS) {
    const validated = validateWeekScheduleDay(body.weekSchedule[short], label);
    if (validated.error) return { error: validated.error };
    weekSchedule[long] = validated.value;
  }

  return {
    input: {
      schoolType,
      grade,
      gradeLabel,
      ideal: idealTarget.value,
      min: minTarget.value,
      naesinScale,
      naesinLastExamKey,
      naesinAllNone,
      selectedNaesinExam,
      priorNaesinGrade,
      naesinOverall,
      naesinExams,
      mockLastRoundKey,
      mockAllNone,
      selectedMockRound,
      mockTrack,
      mockRounds,
      studyHours,
      weekSchedule,
    },
  };
}

// ---------------------------------------------------------------------------
// 파생값 — 전부 동결된 계산 모듈에 위임한다
// ---------------------------------------------------------------------------

/**
 * 내신 현재 점수(9등급 스케일로 환산된 값) + 표시용 마지막 시험 라벨 + 남은 회차.
 *
 * QA 행290 재설계(qa3-held-high-design.md §2) — 스케일 환산과 remain_naesin을 이 함수가
 * 직접 끝낸다(구판은 currentScore만 만들고 remain은 핸들러가 별도 표로 오버라이드했다).
 * 이유:
 *  - 스케일: 고1・고2는 5등급제로 입력받으므로 fiveScaleToNine으로 9등급 환산해야
 *    calcNaesinProb이 goal_university_cuts.normal(9등급 기준)과 같은 자로 잴 수 있다.
 *    고3은 이미 9등급제라 그대로 쓴다(§9 결정②).
 *  - remain_naesin: lastExam이 학생의 현재 학년보다 이전 학년 시험일 수 있다(예: 고3인데
 *    마지막이 "고2 2학기 기말") — getRemainingNaesin(grade, examLabel) 표를 그 시험이
 *    "속한 학년"으로 조회해야 정확하다. 파이프라인 내부의 `${student.grade}_${lastNaesin}`
 *    조합에 맡기면(remainingNaesin 오버라이드가 없을 때만 동작) 학생의 현재 학년과 시험이
 *    속한 학년이 어긋나는 순간 완전히 틀린 순번을 조회한다. 그래서 이 함수가 항상
 *    명시적으로 계산해 돌려주고, 핸들러는 그 값을 remainingNaesin 오버라이드로 그대로
 *    buildInitialStudentState에 넘긴다(표를 재구현하지 않고 getRemainingNaesin을 그대로
 *    호출한다 — 계산 모듈은 동결 대상).
 *
 * "아직 없음"이면 priorNaesinGrade로 currentScore를 대체하고(0 이면 최고 등급으로
 * 오클램프되는 구멍을 막는다, 구판과 동일한 이유) 라벨은 '' 로 둔다. 고1은 중학교
 * 평균 **원점수**(0~100)를 middleAvgToNine으로, 고2・고3은 이전 학년까지의 평균
 * **등급**(1~9, 9등급제)을 그대로 쓴다(기존 priorNaesinGrade 흐름 유지).
 */
/**
 * 저장된 학생 행에서 내신 "전 시험 없음(naesinAllNone)" 여부를 판정한다 —
 * intake-update.ts가 내신 section을 건드리지 않는 부분 수정에서, 기존 학년 치환
 * (고1 중3 특례) 여부를 다시 판단할 때 이 값이 필요하다.
 *
 * naesin_scores.lastExam(jsonb 내부 필드)이 아니라 last_naesin_exam 컬럼(바로 위
 * deriveNaesin이 온보딩·수정 저장 시점마다 직접 쓰는 값, "" 아니면 실제 시험 라벨만
 * 들어온다)을 근거로 삼는다 — naesin_scores가 null이거나 2026-09-02(749cc3a4)
 * 이전 구 형식(지금과 다른 키 이름공간이라 lastExam 필드 자체가 없음)이어도 이
 * 컬럼만은 온보딩 시점에 항상 계산되어 채워져 있다. `!existing.naesin_scores?.lastExam`
 * 식으로 jsonb를 직접 보면 이런 행에서 undefined를 "전 시험 없음"으로 오판해 고1
 * 학생의 엔진 학년이 '중3'으로 잘못 치환된다.
 */
export function isStoredNaesinAllNone(row: {
  last_naesin_exam: unknown;
}): boolean {
  return row.last_naesin_exam === "";
}

export function deriveNaesin(input) {
  const {
    naesinAllNone,
    priorNaesinGrade,
    gradeLabel,
    naesinScale,
    naesinOverall,
    selectedNaesinExam,
  } = input;

  if (naesinAllNone) {
    const nineScale =
      gradeLabel === "고1"
        ? middleAvgToNine(Number(priorNaesinGrade))
        : Number(priorNaesinGrade);

    return {
      currentScore: nineScale ?? 0,
      lastNaesinExam: "",
      remainNaesin: NAESIN_NONE_REMAINING[gradeLabel] ?? null,
    };
  }

  const nineScale =
    naesinScale === 9
      ? Number(naesinOverall)
      : fiveScaleToNine(Number(naesinOverall));

  return {
    currentScore: nineScale ?? 0,
    lastNaesinExam: flowLabel(selectedNaesinExam),
    remainNaesin: getRemainingNaesin(
      selectedNaesinExam.gradeLabel,
      selectedNaesinExam.examLabel,
    ),
  };
}

/**
 * naesin_scores.groupAverages — 리포트(행301)가 "현재 위치" 스냅샷으로 바로 소비할 수
 * 있게 마지막으로 본 시험의 과목군 평균만 평평하게 뽑아낸다(원본 naesinExams는 시험별로
 * 중첩돼 있어 소비 지점마다 최신 시험을 다시 찾아야 하는 번거로움이 있다). 마지막 시험에
 * 과목군 입력이 하나도 없으면(전체 평균만 입력) 빈 객체 — 리포트 쪽이 4과목 flat 모드로
 * 폴백한다(qa3-held-high-design.md §7 입력 규칙).
 */
export function deriveNaesinGroupAverages(naesinExams, selectedNaesinExam) {
  if (!selectedNaesinExam) return {};
  const match = naesinExams.find((exam) => exam.key === selectedNaesinExam.key);
  if (!match) return {};
  return Object.fromEntries(
    Object.entries(match.groups).map(([groupKey, group]) => [
      groupKey,
      (group as { avg: number }).avg,
    ]),
  );
}

/**
 * 등급 1~9 → 백분위. GRADE_PERCENTILE 밴드의 중앙값을 쓴다 —
 * 원본 칩 UI 의 "(안정)" 라벨이 붙는 값과 같다(getPercentileChips, jeongsi.js:162).
 *
 * GRADE_PERCENTILE(jeongsi.js:138-148)의 키는 정수 1~9 뿐인데 온보딩 검증은
 * 소수 등급(2.5 등)도 통과시키므로, 밴드 조회 전에 반올림 후 [1,9] 로 클램프한다.
 * (영어는 이 환산을 타지 않는다 — 아래 buildMogoScores 참고.)
 */
function gradeToPercentile(rawGrade) {
  const numeric = Number(rawGrade);
  // 방어선. validateIntakeBody 가 normalizeGrade 로 정규화하므로 정상 경로에서는
  // 걸리지 않는다. Math.round(NaN) = NaN → Math.max(1, NaN) = NaN 이라 클램프가
  // NaN 을 통과시키고 GRADE_PERCENTILE[NaN] = undefined 를 읽어 TypeError 가 나던
  // 자리다 — 검증기를 통과한 입력으로 엔드포인트를 죽일 수 있었다.
  if (!Number.isFinite(numeric)) {
    throw new Error(
      `[intake] gradeToPercentile: 등급이 숫자가 아니다 (${String(rawGrade)})`,
    );
  }
  const index = Math.min(9, Math.max(1, Math.round(numeric)));
  // biome-ignore lint/style/noNonNullAssertion: index는 항상 1~9로 클램프되고 GRADE_PERCENTILE는 1~9 전부 정의됨
  const band = GRADE_PERCENTILE[index]!;
  return Math.round((band.min + band.max) / 2);
}

type RawMockRounds = Record<
  string,
  {
    kor: { grade: string; pct: number | null };
    math: { grade: string; pct: number | null };
    eng: { grade: string };
    tam1: { grade: string; pct: number | null };
    tam2: { grade: string; pct: number | null };
  }
>;

type ResolvedMockRounds = Record<
  string,
  {
    kor: { grade: string; pct: number };
    math: { grade: string; pct: number };
    eng: { grade: string };
    tam1: { grade: string; pct: number };
    tam2: { grade: string; pct: number };
  }
>;

/**
 * 회차별 pct(사용자가 고른 백분위 칩)를 확정한다 — pct가 있으면 그대로, 없으면(칩을 안
 * 골랐으면) gradeToPercentile 밴드 중앙값으로 대체한다.
 *
 * ⚠ 로컬 E2E 버그 — 이 대체 로직 자체는 원래도 있었지만(구 buildMogoScores), 앞단
 * isInRange('', 0, 100)이 Number('')===0 을 유효 범위로 오판해 "칩 미선택"을 pct=0으로
 * 확정해 버려서(isInRange 주석 참고) 이 함수가 그 오판된 0을 "값이 있다"고 여기고 대체를
 * 건너뛰었다. isInRange를 고친 지금은 미선택이 정확히 null로 넘어오므로 이 함수가 항상
 * 올바르게 동작한다.
 *
 * currentMogo 계산(buildMogoScores)과 저장(mock_exam_scores.rounds) 양쪽이 반드시 같은
 * 확정값을 봐야 한다 — "계산엔 86.5를 쓰고 저장엔 null을 남긴다"처럼 두 표가 다른
 * 이야기를 하면 안 된다(§9 baseProbsForStorage와 동일한 원칙).
 */
function resolveMockRoundPercentiles(
  mockRounds: RawMockRounds,
): ResolvedMockRounds {
  const resolved: ResolvedMockRounds = {};
  for (const [key, round] of Object.entries(mockRounds)) {
    resolved[key] = {
      kor: {
        grade: round.kor.grade,
        pct: round.kor.pct ?? gradeToPercentile(round.kor.grade),
      },
      math: {
        grade: round.math.grade,
        pct: round.math.pct ?? gradeToPercentile(round.math.grade),
      },
      eng: { grade: round.eng.grade },
      tam1: {
        grade: round.tam1.grade,
        pct: round.tam1.pct ?? gradeToPercentile(round.tam1.grade),
      },
      tam2: {
        grade: round.tam2.grade,
        pct: round.tam2.pct ?? gradeToPercentile(round.tam2.grade),
      },
    };
  }
  return resolved;
}

/**
 * calcJeongsiCompositeFE(jeongsi.js:195-212)가 요구하는 회차별 객체를 만든다. 입력은
 * 이미 resolveMockRoundPercentiles를 거쳐 pct가 전부 확정된 회차만 받는다.
 *
 * 주의점(전부 원본 동작이며 파리티를 유지해야 한다):
 *  - eng 는 백분위가 아니라 **등급 문자열** 그대로다(getEnglishPenaltyFE 가
 *    소수 등급을 선형보간하므로 반올림하지 않고 원문을 넘긴다).
 *  - 영어는 평균이 아니라 "마지막으로 값이 있는 회차"가 덮어쓴다. 그래서 회차
 *    삽입 순서가 결과를 바꾼다 — mockRounds는 validateIntakeBody가 이미 MOCK_FLOW
 *    (학년 순) 순서로 채워 넣었다(위 검증부 주석 참고).
 *  - 값이 없는 회차는 mockRounds에 아예 없다(검증부가 완전히 빈 회차를 저장하지 않는다).
 *    전 회차가 없으면(mockAllNone) 이 함수 자체를 호출하지 않는다(deriveMogo 참고).
 */
function buildMogoScores(resolvedMockRounds: ResolvedMockRounds) {
  const scores: Record<
    string,
    {
      kor: { percentile: number };
      math: { percentile: number };
      eng: string;
      exp1: { percentile: number };
      exp2: { percentile: number };
    }
  > = {};

  for (const [key, round] of Object.entries(resolvedMockRounds)) {
    scores[key] = {
      kor: { percentile: round.kor.pct },
      math: { percentile: round.math.pct },
      eng: round.eng.grade,
      exp1: { percentile: round.tam1.pct },
      exp2: { percentile: round.tam2.pct },
    };
  }

  return scores;
}

/**
 * 정시 종합 백분위(currentMogo) + 표시용 마지막 회차 라벨 + 남은 회차 + 확정된 회차
 * (resolvedRounds, pct가 전부 채워짐 — mock_exam_scores.rounds 저장에 그대로 쓴다).
 *
 * remain_mogo도 deriveNaesin과 같은 이유로 이 함수가 직접 계산한다 — lastRound가 학생의
 * 현재 학년보다 이전 학년 회차일 수 있어(예: 고3인데 마지막이 "고2 10모")
 * getRemainingMogo(grade, examLabel)를 그 회차가 "속한 학년"으로 조회해야 한다. 구판의
 * isMiddleSubstituted 전용 분기(중3 치환 학년으로는 표 조회가 안 돼 학생의 실제 학년을
 * 따로 넘기던 우회)는 이제 불필요하다 — remainMogo가 항상 명시적으로 계산되므로
 * buildInitialStudentState 내부의 `${state.grade}_${lastMogo}` 조합(치환된 '중3' 포함)에
 * 의존할 일이 아예 없다.
 */
export function deriveMogo(input) {
  const { mockAllNone, mockRounds, selectedMockRound, gradeLabel } = input;

  if (mockAllNone) {
    return {
      currentMogo: 0,
      lastMogoExam: "",
      remainMogo: MOGO_NONE_REMAINING[gradeLabel] ?? null,
      resolvedRounds: {} as ResolvedMockRounds,
    };
  }

  const resolvedRounds = resolveMockRoundPercentiles(mockRounds);

  return {
    currentMogo: calcJeongsiCompositeFE(buildMogoScores(resolvedRounds)),
    lastMogoExam: flowLabel(selectedMockRound),
    remainMogo: getRemainingMogo(
      selectedMockRound.gradeLabel,
      selectedMockRound.examLabel,
    ),
    resolvedRounds,
  };
}

/**
 * 요일별 목표 학습시간(study_schedule).
 *
 * QA 행293 이후 온보딩이 원본 calcAvailableHours 의 요일별 계약(요일 7개 × 기상・취침
 * 시각・등하교 시각・학원 N쌍)을 그대로 받는다(validateWeekScheduleDay 가 검증한
 * input.weekSchedule 이 이미 DayPattern 모양이다) — 예전처럼 근사 어댑터
 * (calcAvailableHoursApprox)로 합성 입력을 지어낼 필요가 없어졌다.
 *
 * 가용시간 산출 + 대학 배율 곱 + 학생 자습시간 오버라이드는 여전히
 * **calculateWeekSchedule 을 그대로 호출해서** 처리한다(오버라이드 규칙,
 * schedule.js:349-367 을 이 파일에 베껴 쓰면 동결된 계산 모듈과 두 벌이 되어
 * 언젠가 갈린다). 요일별 등교 여부는 이제 DAYS_CONFIG 고정값이 아니라 사용자가
 * 입력한 hasSchool 을 그대로 쓴다(calculateWeekSchedule 이 day.hasSchool 을
 * 우선한다, schedule.js 참고). 학원 이동시간 공제는 ACADEMY_COMMUTE_HOURS(0.5h,
 * DIVERGENCE.md §1 #5)를 명시로 넘긴다 — 원본은 1h 고정이었다.
 */
// QA 행293 — intake.weekSchedule.test.ts 가 파생값(week_ideal/min 산출 경로)을
// 검증하도록 export. calculateWeekSchedule 자체의 골든 픽스처는 schedule.test.ts
// 소관이라 여기서는 "요청 바디 → weekSchedule 파생"이라는 이 파일 고유의 배선만 본다.
export function buildWeeklySchedule({
  ideal,
  min,
  studyHours,
  weekSchedule,
}: {
  ideal: { university: string; department: string };
  min: { university: string; department: string };
  studyHours: Record<string, number>;
  weekSchedule: Record<string, DayPattern>;
}) {
  const selfStudyHours: Record<string, number> = {};
  for (const { short, long } of WEEKDAYS) {
    selfStudyHours[long] = studyHours[short]!;
  }

  return calculateWeekSchedule({
    idealUniv: ideal.university,
    idealDept: ideal.department,
    minUniv: min.university,
    minDept: min.department,
    weekSchedule,
    selfStudyHours,
    commuteHours: ACADEMY_COMMUTE_HOURS,
  });
}

/**
 * 학습방향 리포트(내신·정시 각 1건, source_type='intake', source_label='내 현재 위치')를
 * 다시 만들어 저장한다. (profile_id, kind, source_type, source_label) 동일 키로 upsert
 * 하므로(saveGoalDirectionReport JSDoc) "새 행 추가"가 아니라 "현재 위치" 스냅샷 자체를
 * 덮어쓴다 — 온보딩(이 파일의 handler)뿐 아니라 내 정보 수정 부분 업데이트
 * (api/goal/intake-update.ts)도 저장된 값(목표 대학·내신·모의고사 중 무엇을 고쳤든)이
 * 바뀌면 이 함수를 그대로 호출해 "학습 data 반영이 새롭게 적용됩니다" 문구를 실제로
 * 지킨다 — 재구현 금지.
 */
export async function regenerateDirectionReports(
  supabaseAdmin: SupabaseClient,
  profileId: string,
  savedRow: {
    grade: string | null;
    naesin_scores: unknown;
    mock_exam_scores: unknown;
    converted_grade: number | null;
    current_mogo: number | null;
  },
): Promise<void> {
  for (const kind of ["naesin", "jungsi"] as const) {
    const legacyEntry =
      kind === "naesin"
        ? { value: savedRow.converted_grade }
        : { value: savedRow.current_mogo };
    const { payload, snapshot } = buildGoalDirectionReport({
      kind,
      sourceType: "intake",
      sourceLabel: "내 현재 위치",
      grade: savedRow.grade,
      naesinScores: savedRow.naesin_scores,
      mockExamScores: savedRow.mock_exam_scores,
      legacyEntry,
      gradePercentile: GRADE_PERCENTILE,
    });
    await saveGoalDirectionReport(supabaseAdmin, profileId, {
      kind,
      sourceType: "intake",
      sourceLabel: "내 현재 위치",
      payload,
      snapshot,
    });
  }
}

export type EngineDerivedInput = {
  /** SCHOOL_TYPE_MAP을 거친 라벨("일반고"/"특목고") — 코드값이 아니다. */
  schoolType: string;
  /** 학생이 실제로 고른 학년("고1"/"고2"/"고3") — '중3' 치환 전. */
  gradeLabel: string;
  naesinAllNone: boolean;
  currentScore: number;
  currentMogo: number;
  lastNaesinExam: string;
  lastMogoExam: string;
  remainNaesin: number | null;
  remainMogo: number | null;
  weeklySchedule: ReturnType<typeof calculateWeekSchedule>;
  ideal: { university: string; department: string };
  min: { university: string; department: string };
  now: Date;
};

/**
 * 목표 대학 컷 조회 → 계산 엔진 호출 → 저장용 확률 스냅샷까지, "합격가능성 계산
 * 경로"를 한 곳에 묶은 함수(원 핸들러 5~9단계 중 순수 계산 글루만). 온보딩(이 파일의
 * handler)과 내 정보 수정 부분 업데이트(api/goal/intake-update.ts)가 반드시 같은
 * 경로를 타야 한다 — 특히 '중3' 치환, cuts null→0 판정, convertedGrade 오버라이드처럼
 * 미묘한 매핑을 두 곳에 각자 베껴 쓰면 반드시 갈린다(파일 상단 주석 "계산 모듈은
 * 동결" 원칙의 연장). 호출부는 반환된 state/baseProbsForStorage/cuts/missing/
 * hasSusiCuts/hasJungsiCuts를 그대로 저장·응답에 쓰면 된다.
 */
export async function computeEngineDerivedFields(
  supabaseAdmin: SupabaseClient,
  input: EngineDerivedInput,
) {
  // 원본 effectiveGrade(IntakeForm.tsx:1176-1179) — 위 handler 주석과 동일 사유.
  const isMiddleSubstituted = input.naesinAllNone && input.gradeLabel === "고1";
  const engineGrade = isMiddleSubstituted ? "중3" : input.gradeLabel;

  const schoolCutType = getSchoolCutType(input.schoolType);

  const { cuts, missing } = await fetchTargetCuts(supabaseAdmin, {
    schoolCutType,
    ideal: input.ideal,
    min: input.min,
  });

  const hasSusiCuts = cuts.idealNaesin !== null && cuts.minNaesin !== null;
  const hasJungsiCuts = cuts.idealJungsi !== null && cuts.minJungsi !== null;

  // biome-ignore lint/suspicious/noExplicitAny: calc/pipeline.ts 반환 타입 추론 결함(범위 밖) — handler와 동일 사유.
  const state: any = buildInitialStudentState({
    schoolType: input.schoolType,
    grade: engineGrade,
    currentScore: input.currentScore,
    currentMogo: input.currentMogo,
    lastNaesin: input.lastNaesinExam,
    lastMogo: input.lastMogoExam,
    remainingNaesin: input.remainNaesin,
    remainingMogo: input.remainMogo,
    cuts: cuts as CutsInput,
    convertedGrade: input.currentScore,
    weeklySchedule: input.weeklySchedule,
    now: input.now,
  });

  const baseProbsForStorage = {
    idealSusi: hasSusiCuts ? state.baseProbs.idealSusi : null,
    idealJungsi: hasJungsiCuts ? state.baseProbs.idealJungsi : null,
    minSusi: hasSusiCuts ? state.baseProbs.minSusi : null,
    minJungsi: hasJungsiCuts ? state.baseProbs.minJungsi : null,
  };

  return {
    schoolCutType,
    cuts,
    missing,
    hasSusiCuts,
    hasJungsiCuts,
    state,
    baseProbsForStorage,
  };
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

function readBody(req: VercelRequest) {
  const body = req.body;
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return sendError(res, "detail", 405, "Method not allowed");
  }

  try {
    // 1) 게이트 — 405 → 401 → 403 (§9-1)
    const session = await openGoalSession(req);
    if (session.error) {
      return sendError(
        res,
        "detail",
        session.error.status,
        session.error.body.detail as string,
      );
    }

    const { allowed } = session;

    // 쓰기형이므로 미결제는 403 이다(조회형만 200 {allowed:false}).
    if (!allowed) {
      return res.status(403).json({ detail: PAID_MESSAGE });
    }

    const { supabaseAdmin, profileId } = narrowGoalSession(session);

    // 2) 재온보딩 차단 (미결 Q3 기본안)
    //    base_* 를 다시 계산하면 그동안 쌓인 Σdelta 가 옛 base 위에 얹혀 확률이 튄다.
    //    status='awaiting_cuts'(onboarded_at = null) 인 행은 아직 확률이 없으므로
    //    목표 대학을 바꿔 다시 시도할 수 있게 열어 둔다.
    //    (학생 부분 수정은 delta 유지(2026-09-23 결정) — 이 전면 재온보딩 차단과
    //    달리 api/goal/intake-update.ts는 Σdelta를 보존한 채 base_*만 재계산한다.)
    const existing = await fetchStudentRow(supabaseAdmin, profileId);
    if (existing?.onboarded_at) {
      return res.status(409).json({
        detail: "이미 온보딩을 완료했습니다.",
        reason: "already_onboarded",
      });
    }

    // 3) 입력 검증 + 4) 값 매핑
    const validated = validateIntakeBody(readBody(req));
    if (validated.error) {
      return res.status(validated.error.status).json(validated.error.body);
    }

    const input = validated.input;
    const schoolType = SCHOOL_TYPE_MAP[input.schoolType];
    const inputGrade = GRADE_MAP[input.grade]; // 온보딩에서 학생이 실제로 고른 학년

    // 5) 성적 파생 — remain_naesin/remain_mogo도 이 두 함수가 직접 계산해 돌려준다
    //    (deriveNaesin/deriveMogo 주석 참고, QA 행290・291 재설계로 아래 옛 remainingNaesin/
    //    remainingMogo 오버라이드 표 계산은 필요 없어졌다).
    const { currentScore, lastNaesinExam, remainNaesin } = deriveNaesin(input);
    const {
      currentMogo,
      lastMogoExam,
      remainMogo,
      resolvedRounds: resolvedMockRounds,
    } = deriveMogo(input);

    // 6~8) 목표 대학 컷 조회 → 파이프라인 → 확률 스냅샷.
    //    '중3' 치환·cuts null 판정·convertedGrade 오버라이드 등 미묘한 매핑은 전부
    //    computeEngineDerivedFields(내 정보 수정과 공유하는 계산 경로)로 옮겼다 —
    //    그 함수 JSDoc 참고, 이 파일에서 재구현하지 않는다.
    const now = new Date();
    const {
      cuts,
      missing,
      hasSusiCuts,
      hasJungsiCuts,
      state,
      baseProbsForStorage,
    } = await computeEngineDerivedFields(supabaseAdmin, {
      schoolType,
      gradeLabel: inputGrade,
      naesinAllNone: input.naesinAllNone,
      currentScore,
      currentMogo,
      lastNaesinExam,
      lastMogoExam,
      remainNaesin,
      remainMogo,
      weeklySchedule: buildWeeklySchedule(input),
      ideal: input.ideal,
      min: input.min,
      now,
    });

    // 9) 저장
    const row = {
      profile_id: profileId,

      school_type: schoolType,
      // '중3' 치환은 엔진 호출 전용이다(위 effectiveGrade 주석 참고) — DB·화면에는
      // 학생이 실제로 고른 학년을 남긴다. goal_students.grade 의 유일한 소비처는
      // goalRepo.js:315 buildStudentPayload 의 profile.grade(표시용)뿐이라 계산에는
      // 영향이 없다(직접 grep 확인). 특례 식별자는 naesin_scores.priorNaesinGrade 로
      // 이미 행에 남아 있다.
      grade: inputGrade,

      ideal_university: input.ideal.university,
      ideal_department: input.ideal.department,
      min_university: input.min.university,
      min_department: input.min.department,

      ideal_naesin_cut: cuts.idealNaesin,
      ideal_jungsi_cut: cuts.idealJungsi,
      min_naesin_cut: cuts.minNaesin,
      min_jungsi_cut: cuts.minJungsi,

      current_score: state.currentScore,
      converted_grade: state.convertedGrade,
      current_mogo: state.currentMogo,

      remain_naesin: state.remainNaesin,
      remain_mogo: state.remainMogo,
      last_naesin_exam: lastNaesinExam,
      last_mogo_exam: lastMogoExam,

      // QA 행290・291 재설계(qa3-held-high-design.md §2・§3) — jsonb 컬럼 코멘트가
      // "회차·과목 구성이 흔들려 정규화하지 않는다"고 못 박은 free-form이라 shape을
      // 바꾸는 데 마이그레이션이 필요 없다. 리포트(행301)가 바로 소비할 수 있는 형태로
      // 저장한다: lastExam/scale/overall + exams(시험별 과목군) + groupAverages(마지막
      // 시험의 과목군 평균만 평평하게, 없으면 리포트가 4과목 flat 모드로 폴백).
      naesin_scores: {
        lastExam: input.naesinLastExamKey,
        scale: input.naesinScale,
        overall: input.naesinAllNone ? null : Number(input.naesinOverall),
        exams: input.naesinExams,
        groupAverages: deriveNaesinGroupAverages(
          input.naesinExams,
          input.selectedNaesinExam,
        ),
        // 전 시험 '없음' 특례일 때만 입력 원본을 한 칸 덧붙인다 — current_score 만
        // 봐서는 그 값이 고교 내신인지 이전 단계 평균인지 구분할 수 없다.
        ...(input.naesinAllNone
          ? { priorNaesinGrade: Number(input.priorNaesinGrade) }
          : {}),
      },
      // rounds는 deriveMogo가 확정한 resolvedMockRounds를 쓴다 — pct가 전부 채워져
      // 있어(로컬 E2E 버그 수정) 저장값과 currentMogo 계산이 같은 백분위를 본다.
      mock_exam_scores: {
        lastRound: input.mockLastRoundKey,
        track: input.mockTrack,
        rounds: resolvedMockRounds,
      },

      // 컷이 없으면 확률을 null 로 둔다 — "0%"와 "미산출"은 다른 상태다(§5 말미).
      // 수시/정시는 서로 독립으로 판정한다(§7-1-A) — 정시 컷만 없어도 수시
      // 확률은 그대로 저장한다.
      base_ideal_susi: baseProbsForStorage.idealSusi,
      base_ideal_jungsi: baseProbsForStorage.idealJungsi,
      base_min_susi: baseProbsForStorage.minSusi,
      base_min_jungsi: baseProbsForStorage.minJungsi,

      rate_ideal_susi: hasSusiCuts ? state.rates.idealSusiBonus : null,
      rate_ideal_jungsi: hasJungsiCuts ? state.rates.idealJungsiBonus : null,
      rate_min_susi: hasSusiCuts ? state.rates.minSusiBonus : null,
      rate_min_jungsi: hasJungsiCuts ? state.rates.minJungsiBonus : null,

      study_schedule: state.weeklySchedule,
      week_ideal: state.weekIdeal,
      week_min: state.weekMin,
      // 원본 입력 보존(QA 행293) — study_schedule은 이로부터 산출된 파생값이다.
      // 재편집·표시용 원본은 이 컬럼이 유일한 소스다(naesin_scores/mock_exam_scores와
      // 같은 free-form jsonb 성격, 마이그레이션 20260902080252 참고).
      week_schedule_input: input.weekSchedule,

      // 가상 날짜의 원점은 rate 와 같은 시점이어야 한다(§8 #14). 온보딩 자체가
      // 성립하는 기준은 수시 컷이다 — 정시 컷 누락은 더 이상 온보딩을 막지
      // 않는다(§9-Q1(b)). 수시 컷도 없는 awaiting_cuts 행만 원점을 두지 않는다.
      actual_start_date: hasSusiCuts ? kstYMD(now) : null,
      onboarded_at: hasSusiCuts ? now.toISOString() : null,
      status: hasSusiCuts ? "active" : "awaiting_cuts",
    };

    const savedRow = await upsertStudentRow(supabaseAdmin, row);

    // 10) 컷 누락 — 입력은 버리지 않고 422 로 알린다(§9-3).
    //     정시 컷 누락은 더 이상 422 사유가 아니다 — 수시 컷이 없을 때만 낸다.
    //     fetchTargetCuts/CUT_KEYS(goalRepo.js)는 listMissingCuts(관리자의
    //     "컷 만들기" 버튼) 등 범용 소비처가 있어 고치지 않고, 여기 호출부에서
    //     수시 2종만 걸러 응답한다(§7-1-A 1번).
    if (!hasSusiCuts) {
      const susiMissing = missing.filter(
        (key) => key === "idealNaesin" || key === "minNaesin",
      );
      return res.status(422).json({
        detail: "목표 대학의 합격 기준 데이터가 아직 준비되지 않았습니다.",
        reason: "cut_not_found",
        missing: susiMissing,
      });
    }

    // 11) 확률 스냅샷 — row 에 저장한 것과 같은 null 판정(baseProbsForStorage)을
    //     그대로 넘긴다. state.baseProbs 원값을 직접 넘기면 정시 컷이 없을 때
    //     0 이 들어가 goal_students(null)와 어긋난다.
    await appendProbabilityLog(
      supabaseAdmin,
      profileId,
      baseProbsForStorage,
      "intake",
    );

    // 11-b) QA 행301(a) — 온보딩 최초 학습방향 리포트. naesin_scores/mock_exam_scores는
    //       savedRow 그대로 넘겨 새 shape(groupAverages/rounds, 병렬 유닛 소유)이 이미
    //       반영돼 있으면 우선 쓰고, 아니면 이 지점에서 파이프라인이 막 계산한 대표값
    //       (converted_grade/current_mogo)으로 폴백한다(report.ts ensureDirectionReports의
    //       fallback과 동일 값 소스). 실제 조립·저장은 regenerateDirectionReports로
    //       뗐다 — 내 정보 수정 부분 업데이트와 공유한다(그 함수 JSDoc 참고).
    await regenerateDirectionReports(supabaseAdmin, profileId, savedRow);

    // 12) 응답 — GET /api/goal/student 와 완전히 같은 본문을 담는다.
    //     뷰를 다시 읽는 이유는 두 엔드포인트가 같은 조립 경로를 타게 하기 위해서다
    //     (온보딩 직후에는 누적 증분이 0 이라 값은 base 와 같다).
    const [stateRow, profileName] = await Promise.all([
      fetchStudentStateRow(supabaseAdmin, profileId),
      fetchProfileName(supabaseAdmin, profileId),
    ]);

    return res.status(200).json({
      ok: true,
      // historyRows/recentAvgStudyHours는 온보딩 직후라 비어 있거나 무의미하다(확률
      // 스냅샷은 방금 1건 막 쌓였고, 최근 7일 순공시간은 아직 없다) — GET student와
      // 달리 여기서는 계산하지 않고 기본값(빈 배열/null)에 맡긴다. profile.name만
      // GET /api/goal/student와 동일 규약으로 채운다.
      student: buildStudentPayload(
        savedRow,
        stateRow,
        state.schoolCutType,
        [],
        profileName,
      ),
    });
  } catch (error) {
    console.error("goal/intake error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
