// 목표관리 "일별 증분(확률 게이지)" 계산 — 수식 v2.
//
// bonus.js(v1, 원본 target/App.tsx 이식분·203개 테스트로 동결)와 나란히 두는 신규
// 모듈이다. bonus.js 를 재구현하거나 수정하지 않는다 — v2 는 신시안("오늘의 공부
// 기록" #26)에 맞춰 팀 내부에서 새로 확정한 수식이며, 원본(target 앱)에 대응하는
// 코드가 없다. 이 파일 전체가 **원본 파리티 밖(신규 결정)**이다.
//
// 수식 (팀장 작업 지시 "수식 v2" 절, 2026-08-13 확정):
//   delta = rate × 달성률배수 × 컨디션배수 × 과목태그배수
//
//   - rate            : goal_students.rate_* (calcStudentBonusRates 가 온보딩 시 1회
//                        산출한 하루 최대 증분율). 이 파일은 만들지 않고 입력으로 받는다.
//   - 달성률배수       : bonus.js 의 getAchievementRateMultiplier 를 그대로 재사용한다
//                        (원본 App.tsx:33-38, 이 구간은 v1/v2 공통 — 새로 만들지 않는다).
//                        이상 delta 4종엔 이상 달성률(studyHours/idealHours), 최소 delta
//                        4종엔 최소 달성률(studyHours/minHours)을 각각 적용한다.
//   - 컨디션배수       : CONDITION_MULTIPLIER(great/normal/tired/exhausted, 아래).
//                        v1 의 성취도(achievement)·집중도(focus) 자기평가 2항목을 신시안
//                        4지선다 컨디션 1항목으로 통합한 것 — v1 과 배수 구조 자체가 다르다.
//   - 과목태그배수     : bonus.js 의 TASK_NAESIN/TASK_MOCK_EXAM/TASK_BONUS_MULTIPLIER 를
//                        그대로 재사용한다(내신 과목 → 수시 2종 ×1.1, 기출/모의고사 →
//                        정시 2종 ×1.1) — v1 과 동일 규칙이라 새로 정의하지 않는다.
//
//   v1 과 달리 이 함수엔 "0시간 감점" 분기가 없다 — 0시간 제출은 daily-record API가
//   저장 이전에 400으로 차단하므로(팀장 지시 "0시간 제출 차단") 이 함수에는 항상
//   studyHours > 0 인 입력만 들어온다. 방해요인(reasons)은 수식에 전혀 반영하지 않는다
//   (기록 전용, 팀장 지시 명시).
//
// 이 모듈도 bonus.js 와 동일하게 순수 함수만 담는다. React·DOM·Supabase·네트워크·
// 전역 상태 의존 없음. api/_routes/goal/daily-record.js(서버)가 유일한 소비처가 되도록
// 설계했다 — 클라이언트가 delta 를 계산해 보내는 경로를 만들지 않는다(v1 이 겪은
// "브라우저가 확률을 조작할 수 있다" 문제를 v2 에서 재현하지 않기 위함).

import {
  getAchievementRateMultiplier,
  TASK_BONUS_MULTIPLIER,
  TASK_MOCK_EXAM,
  TASK_NAESIN,
} from "./bonus.js";

// 컨디션 배수 — 신시안 "오늘의 컨디션" 4지선다(part-09 §180,
// src/components/goal/studyRecordOptions.js CONDITION_OPTIONS)와 값 도메인이 정확히 같다.
// sql/73_goal_daily_record_v2.sql 의 body_condition CHECK 도 이 4값 + 빈 문자열이다.
export const CONDITION_MULTIPLIER = {
  great: 1.1,
  normal: 1.0,
  tired: 0.9,
  exhausted: 0.8,
};

// bonus.js round4Client(65-67행)와 동일 구현. bonus.js 는 이 헬퍼를 export 하지
// 않으므로(index.js 배럴 주석 — round4 계열은 통합하지 않는다) 여기서 별도로 둔다.
function round4(v: number) {
  return Math.round(v * 10000) / 10000;
}

// calculateDailyBonusV2 입력.
interface DailyBonusV2Input {
  idealSusiRate: number;
  idealJungsiRate: number;
  minSusiRate: number;
  minJungsiRate: number;
  condition: string;
  tasks: string[];
  studyHours: number;
  idealHours: number;
  minHours: number;
}

// calculateDailyBonusV2 반환값.
interface DailyBonusV2Result {
  idealSusiBonus: number;
  idealJungsiBonus: number;
  minSusiBonus: number;
  minJungsiBonus: number;
}

/**
 * 하루 제출 1건이 확률 게이지에 더할 증분 4종을 v2 수식으로 구한다.
 *
 * @param {object} input
 * @param {number} input.idealSusiRate   이상 목표 수시 1일 증분율(goal_students.rate_ideal_susi)
 * @param {number} input.idealJungsiRate 이상 목표 정시 1일 증분율(rate_ideal_jungsi)
 * @param {number} input.minSusiRate     최소 목표 수시 1일 증분율(rate_min_susi)
 * @param {number} input.minJungsiRate   최소 목표 정시 1일 증분율(rate_min_jungsi)
 * @param {string} input.condition       컨디션 키(great/normal/tired/exhausted). 미지값·빈
 *   문자열은 CONDITION_MULTIPLIER 미매칭이라 `?? 1.0`(normal 취급)으로 기본값을 준다 —
 *   대시보드 카드-only 제출(컨디션 미입력)이 감점 없이 정상 배수를 받게 하기 위함
 *   (daily-record API 헤더 "카드 최초 제출은 condition 미보유 허용" 규칙과 짝을 이룬다).
 * @param {string[]} input.tasks 오늘 한 학습 유형 태그(한글 라벨, 예: '내신 과목').
 * @param {number} input.studyHours 실제 학습 시간. 호출 전 0 초과가 보장돼야 한다
 *   (0시간 차단은 이 함수의 책임이 아니다 — 호출자 daily-record API 가 막는다).
 * @param {number} input.idealHours 오늘 이상 목표 시간(target_ideal_hours 스냅샷).
 * @param {number} input.minHours 오늘 최소 목표 시간(target_min_hours 스냅샷).
 * @returns {{idealSusiBonus:number, idealJungsiBonus:number, minSusiBonus:number, minJungsiBonus:number}}
 */
export function calculateDailyBonusV2({
  idealSusiRate,
  idealJungsiRate,
  minSusiRate,
  minJungsiRate,
  condition,
  tasks,
  studyHours,
  idealHours,
  minHours,
}: DailyBonusV2Input): DailyBonusV2Result {
  const normalizedIdealHours = Number(idealHours || 0);
  const normalizedMinHours = Number(minHours || 0);

  // bonus.js 224-226행과 동일 관례 — 목표 시간이 0 이하면 달성률을 100%로 간주한다
  // (분모 0 회피). v2 도 이 규칙을 그대로 따른다(팀장 지시 "목표시간 0 이하면 달성률
  // 100 간주(기존 관례)").
  const idealRate =
    normalizedIdealHours > 0 ? (studyHours / normalizedIdealHours) * 100 : 100;
  const minRate =
    normalizedMinHours > 0 ? (studyHours / normalizedMinHours) * 100 : 100;

  const iRateMult = getAchievementRateMultiplier(idealRate);
  const mRateMult = getAchievementRateMultiplier(minRate);

  const conditionMult = CONDITION_MULTIPLIER[condition] ?? 1.0;

  let iSusi = idealSusiRate * iRateMult * conditionMult;
  let iJungsi = idealJungsiRate * iRateMult * conditionMult;
  let mSusi = minSusiRate * mRateMult * conditionMult;
  let mJungsi = minJungsiRate * mRateMult * conditionMult;

  // 내신 과목은 수시에, 기출/모의고사는 정시에만 태그 가산 — bonus.js 235-244행과
  // 동일 규칙(TASK_NAESIN/TASK_MOCK_EXAM/TASK_BONUS_MULTIPLIER 를 그대로 재사용한다).
  if (Array.isArray(tasks) && tasks.includes(TASK_NAESIN)) {
    iSusi *= TASK_BONUS_MULTIPLIER;
    mSusi *= TASK_BONUS_MULTIPLIER;
  }
  if (Array.isArray(tasks) && tasks.includes(TASK_MOCK_EXAM)) {
    iJungsi *= TASK_BONUS_MULTIPLIER;
    mJungsi *= TASK_BONUS_MULTIPLIER;
  }

  return {
    idealSusiBonus: round4(iSusi),
    idealJungsiBonus: round4(iJungsi),
    minSusiBonus: round4(mSusi),
    minJungsiBonus: round4(mJungsi),
  };
}
