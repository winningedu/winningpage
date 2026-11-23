// diagnosisAdmissionCuts — 입결 0행·조회 실패 구분 · ADMISSION_FETCH_ERROR 센티널 계약.
// 원본: scripts/verify-diagnosis-scoring.mjs [F-격리] 섹션 후반부(입결 0행·조회 실패 블록).

import { expect, test } from "vitest";
import { findBannedPhrases } from "@/lib/diagnosisCopyBinding.ts";
import { buildReport } from "@/lib/diagnosisReport.ts";
import { makeInput, sourceOf } from "./diagnosisScoringTestFixtures.ts";

/* ================================================================== *
 * 입결 0행 · 조회 실패 — 배선이 끊기면 학생은 두 상황을 구분할 수 없다
 * ================================================================== */

// diagnosisScoring.admissionBand.test.ts 의 admissionInput 과 동일한 픽스처(§7.4.3 F-확장
// 블록에서 정의된 것과 같은 값) — 조회 실패·0행 판정은 admissionQuery 가 채워진 입력을 전제한다.
const admissionInput = makeInput({
  gradeSystem: "NINE",
  scores: {
    naesinOverall: 2.6,
    recentExamAvg: null,
    mock: {},
    mockFilledCount: 0,
  },
  admissionQuery: {
    university: "건국대",
    department: "경영학과",
    admissionType: "종합",
    detailType: "일반전형",
  },
});

{
  const failed = buildReport(admissionInput, {
    cuts: null,
    cutsError: true,
  }).admission;
  // 실패는 컷을 못 가져온 것이지 내 성적이 사라진 게 아니다 — 내 성적 행은 남고 컷 행만 없다.
  // 남는 행은 내 성적 행(emphasis)뿐이다 — 컷 행은 emphasis 가 false 라 이 단언으로 걸러진다.
  test("조회 실패면 컷 행을 만들지 않는다(있지도 않은 숫자를 지어내지 않는다)", () => {
    expect(failed.rows.every((row) => row.emphasis === true)).toBe(true);
  });
  test("내 성적 행은 그대로 남는다", () => {
    expect(failed.rows.length).toEqual(1);
  });
  // G-1b(2026-08-12) 회귀 방지 — 종전엔 이 단언이 `hasRows === true` 를 정상으로 봤다. 그게
  // 바로 F-10 버그였다: mine 행 1개만 있어도 "표가 있다"로 잘못 판정해 헤더 + 자기 성적 1행짜리
  // 빈 비교표가 그려졌다. 이제 hasRows 는 '비교 대상(컷 행)이 있는가'를 본다 — mine 뿐이면 false.
  test("mine 행만 있으면 hasRows=false (비교 대상이 없다 — F-10 재발 방지)", () => {
    expect(failed.hasRows).toEqual(false);
  });
  // REPORT_FALLBACK.BAND_VALUE_NODATA 는 diagnosisReport.js 밖으로 export 되지 않는다(그 파일의
  // 유일한 소비자라는 계약) — 값 자체('자료 없음')를 직접 비교한다. probabilityValue 의 동일
  // 폴백 자리와 값을 공유한다(§7.2 REPORT_FALLBACK 정의).
  test("mine 행만 있어도 emptyNotice 는 값을 낸다(NOTICE_ROW 모드가 쓸 문구)", () => {
    expect(failed.emptyNotice).toEqual("자료 없음");
  });
  test("조회 실패여도 확률에 % 가 없다", () => {
    expect(!String(failed.probabilityValue).includes("%")).toBe(true);
  });
  test("조회 실패와 결측이 동시에 참일 수 없다", () => {
    expect([
      failed.fetchFailed,
      buildReport(admissionInput, { cuts: null }).admission.fetchFailed,
    ]).toEqual([true, false]);
  });
  // 실패 문장은 인쇄에도 나간다(자료를 못 불러왔다는 사실은 종이에서도 참이다) → 금지어 검사 대상.
  test("실패 문장에 금지어 없음", () => {
    expect(findBannedPhrases(failed.summary).map((hit) => hit.phrase)).toEqual(
      [],
    );
  });
}

// 센티널 계약은 값이 아니라 **호출부의 비교 방식**에서 깨진다 — 소스로 못 박는다.
{
  const cutsSource = sourceOf("lib/diagnosisAdmissionCuts.ts");
  test("조회 실패는 센티널로 반환한다(에러를 null 로 삼키지 않는다)", () => {
    expect(cutsSource.includes("return ADMISSION_FETCH_ERROR")).toBe(true);
  });
  test("예외도 값으로 정규화한다(훅에 throw 가 새지 않는다)", () => {
    expect(/try\s*{/.test(cutsSource) && cutsSource.includes("catch")).toBe(
      true,
    );
  });

  const cascadeSource = sourceOf("hooks/useAdmissionCascade.ts");
  test("훅은 참조 동일성으로 판별한다(=== ADMISSION_FETCH_ERROR)", () => {
    expect(cascadeSource.includes("=== ADMISSION_FETCH_ERROR")).toBe(true);
  });
  test("느슨한 비교로 센티널을 결측에 뭉개지 않는다", () => {
    expect(
      !cascadeSource.includes("== ADMISSION_FETCH_ERROR)") ||
        cascadeSource.includes("=== ADMISSION_FETCH_ERROR"),
    ).toBe(true);
  });
  test("네트워크 예외를 받는 마지막 관문(.catch)이 있다", () => {
    expect(cascadeSource.includes(".catch(")).toBe(true);
  });
  // 리셋이 없으면 한 번 실패한 뒤 다른 대학을 골라도 계속 에러 화면이 남는다.
  // G-1a(2026-08-12) — setCuts/setCutsError 개별 호출이 applyOutcome(cuts, cutsError) 헬퍼로
  // 통합됐다(상태와 cutsOutcomeRef 스냅샷을 항상 함께 갱신하기 위해서다 — awaitCuts() 가 그
  // ref 를 읽는다). 리셋 경로는 이제 `applyOutcome(null, false)` 다.
  test("선택이 바뀌면 에러 상태를 되돌린다", () => {
    expect(cascadeSource.includes("applyOutcome(null, false)")).toBe(true);
  });
  test("훅이 cutsError 를 밖으로 낸다", () => {
    expect(/cutsError/.test(cascadeSource)).toBe(true);
  });
  // awaitCuts() — 제출 시점 경합 방지(G-1a). 진행 중인 조회를 기다린 뒤 ref 스냅샷을 직접
  // 돌려준다. state 를 읽지 않는 이유는 다음 렌더까지 반영이 늦어질 수 있어서다.
  test("awaitCuts 가 정의돼 있다(제출 시점 경합 방지)", () => {
    expect(cascadeSource.includes("awaitCuts")).toBe(true);
  });
  // 센티널 객체를 그대로 저장하면 직렬화로 참조 동일성이 사라진다 — 불리언만 넘어가야 한다.
  test("저장 계층은 불리언 신호만 받는다", () => {
    expect(
      sourceOf("lib/diagnosisInputStorage.ts").includes("admissionCutsError"),
    ).toBe(true);
  });
}
