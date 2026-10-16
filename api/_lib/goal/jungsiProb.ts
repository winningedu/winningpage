// 정시(jungsi) 확률·rate — 지연 재계산(lazy recalc) 전용 조합 모듈.
// 행296·332(QA3 §9-5 결정3): 온보딩 시점에 목표 대학 정시 컷이 없어
// base_ideal_jungsi/base_min_jungsi 가 null 로 저장된 학생은, 이후 어드민이
// 정시 컷을 등록해도 그 값이 영원히 null 로 남는다 — 온보딩은 컷 4종을 그
// 순간에만 조회하고 다시 채우지 않기 때문이다. 이 모듈은 GET /api/goal/student
// 가 매 조회 때 "채울 수 있으면 채운다"를 하도록 순수 계산만 담는다.
//
// calc/pipeline.ts(다른 배치 소유, 이 작업 범위 밖 — 그 파일 722-726행 주석과
// 같은 이유로 손대지 않는다)의 341-358행 정시 계산과 정확히 같은 원시 함수
// (calcJeongsiProb, calcStudentBonusRates)를 그대로 호출한다. pipeline.ts 를
// 고치지 않고도 "온보딩 경로와 지연 재계산 경로가 같은 값을 낸다"는 계약을
// 지킨다 — 계산 로직 자체를 복제하지 않고, 이미 동결·테스트된 원시 함수만
// 재사용한다.
//
// 재계산이 과거 기록을 소급하지 않는 이유(구현 아님, 기존 동작의 자연스러운
// 결과): api/goal/daily-record.ts:470-472 가 rate_ideal_jungsi/rate_min_jungsi
// null 을 이미 0 으로 접어(`num(student.rate_ideal_jungsi) ?? 0`) 왔으므로,
// 정시 컷이 없던 기간의 모든 study_records.delta_*_jungsi 는 처음부터 0 이었다.
// 즉 뷰(goal_student_state)가 매번 다시 더하는 clamp(base + Σdelta) 의 Σdelta 는
// 이 재계산 이전 구간에서 항상 0 이다 — base/rate 만 지금 채우면 그 시점부터
// 정확히 반영되고, 별도의 "소급 금지" 가드를 추가로 둘 필요가 없다.
//
// React·DOM·Supabase 의존 없는 순수 함수만 담는다.

import { calcStudentBonusRates } from "../../../src/lib/goal/calc/bonus.js";
import { calcJeongsiProb } from "../../../src/lib/goal/calc/jeongsi.js";
import { num } from "./repo.js";

export interface JungsiRecalcInput {
  // effectiveGrade — resolveJungsiEffectiveGrade() 로 구한 값을 넘긴다.
  grade: string;
  currentMogo: number;
  remainMogo: number | null;
  idealJungsiCut: number;
  minJungsiCut: number;
  now?: Date;
}

export interface JungsiRecalcResult {
  idealJungsi: number;
  minJungsi: number;
  idealJungsiBonus: number;
  minJungsiBonus: number;
}

/**
 * 정시 확률 2종 + rate 2종을 계산한다. 호출부(student.ts)는 currentMogo > 0
 * 이고 컷 쌍(이상·최소)이 모두 있을 때만 이 함수를 부른다 — pipeline.ts:341-348
 * 과 같은 "currentMogo <= 0 이면 0" 게이트는 방어적으로만 여기 남긴다.
 */
export function computeJungsiRecalc(
  input: JungsiRecalcInput,
): JungsiRecalcResult {
  const {
    grade,
    currentMogo,
    remainMogo,
    idealJungsiCut,
    minJungsiCut,
    now = new Date(),
  } = input;

  const idealJungsi =
    currentMogo > 0
      ? calcJeongsiProb(currentMogo, idealJungsiCut, remainMogo, 14)
      : 0;
  const minJungsi =
    currentMogo > 0
      ? calcJeongsiProb(currentMogo, minJungsiCut, remainMogo, 14)
      : 0;

  // calcStudentBonusRates 는 susi/jungsi rate 를 한 호출로 함께 반환하지만
  // 두 계열은 입력·출력이 완전히 독립이다(bonus.ts:151-161 — totalSusiDays/
  // totalJungsiDays 가 서로 다른 기준일에서만 나오고 서로 참조하지 않는다).
  // susi 자리에는 0 을 채우고 jungsi 결과만 취한다 — susi rate 는 온보딩
  // 시점에 이미 계산·저장돼 있어 이 경로가 절대 건드리지 않는다.
  const rates = calcStudentBonusRates(grade, 0, idealJungsi, 0, minJungsi, now);

  return {
    idealJungsi,
    minJungsi,
    idealJungsiBonus: rates.idealJungsiBonus,
    minJungsiBonus: rates.minJungsiBonus,
  };
}

/**
 * effectiveGrade 복원 — intake.ts 의 isMiddleSubstituted 치환 규칙
 * (고1 + 내신 전 회차 없음 → '중3' 으로 엔진에 주입)과 동일한 결과를 낸다.
 *
 * goal_students.grade 는 학생이 실제로 고른 학년만 저장한다(치환값은 저장하지
 * 않는다 — intake.ts:767-772 "저장" 주석과 같은 규약). 대신 naesin_scores 에
 * priorNaesinGrade 가 실려 있으면 그건 naesinAllNone=true 였다는 증거다
 * (intake.ts:798-800 — naesinAllNone 일 때만 그 키를 붙인다). grade==='고1' 과
 * 겹치면 isMiddleSubstituted 조건과 정확히 같아진다.
 */
export function resolveJungsiEffectiveGrade(
  grade: string,
  naesinScores: unknown,
): string {
  const priorNaesinGrade =
    naesinScores && typeof naesinScores === "object"
      ? (naesinScores as Record<string, unknown>).priorNaesinGrade
      : undefined;
  return grade === "고1" && priorNaesinGrade != null ? "중3" : grade;
}

/**
 * 지연 재계산 트리거 조건(설계 §9-5 결정3 "조건: ideal_jungsi IS NULL AND
 * current_mogo > 0"). goal_students 행 자체만으로 판단 가능한 절반이고,
 * 나머지 절반(정시 컷 쌍 존재 여부)은 DB 조회가 필요해 호출부가 별도로 확인한다.
 */
export function needsJungsiRecalcAttempt(row: {
  base_ideal_jungsi: unknown;
  current_mogo: unknown;
}): boolean {
  return (
    num(row.base_ideal_jungsi) === null && (num(row.current_mogo) ?? 0) > 0
  );
}
