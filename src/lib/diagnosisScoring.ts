/**
 * 학습진단 채점 엔진 — 순수 함수 모듈.
 *
 * 정본: docs/학습진단-계산엔진-적용명세.md §3(응답 스키마) · §4(계산식 전량).
 *
 * 세 가지 계약을 지킨다.
 * 1) **문구 모듈을 import 하지 않는다.** §4.6 의사코드는 TEMPLATE_COPY/fill 을 직접 부르지만
 *    그대로 옮기면 엔진 → 문구 역의존이 생겨 §5.3 ①(문구 정적 검사)과 엔진 회귀가 한 덩어리로
 *    엉킨다. 엔진은 코드·수치만 내고 문자열 조립은 diagnosisReport 가 맡는다.
 * 2) **반올림은 딱 두 지점**(§4 서두 B-02) — 영역 점수 정수 1회, 종합 점수 소수1 1회.
 *    그 외 중간값(scalePart 26.25, fit, areaPart)은 반올림하지 않는다.
 * 3) **NaN 을 내지 않는다.** 모든 상수 조회는 `POINTS[code] ?? 0` 폴백을 거친다. NaN 은 영역 →
 *    종합 → 뱃지 → gap → 긴급도까지 그대로 전파돼 리포트 전체를 무너뜨린다(§4.2.2).
 *
 * 부수효과가 없다 — 시계도 읽지 않는다(diagnosedAt 은 호출부가 넣는다). React 미의존.
 */

import {
  clamp,
  fiveScaleToNine,
  isUsableNumber,
  middleAvgToNine,
  roundHalfUp,
} from "@/data/diagnosisGradeScale.js";
import {
  // §11 자체 결정 상수 — 값은 전부 표에 있고 이 모듈은 읽기만 한다.
  ADMISSION_BAND_BASE_PROBABILITY,
  ADMISSION_BAND_EDGE_ADJUST,
  ADMISSION_MARGIN,
  ADMISSION_ROW_KEYS,
  AREA_AUX_SOURCE,
  AREA_BAND_THRESHOLDS,
  AREA_BASE,
  AREA_CODES,
  AREA_LABEL,
  AREA_SCALE_MAP,
  BADGES,
  CALL_MENTOR_KEYWORDS,
  CSAT_MIN_DELTA,
  DIFFICULTY_DEDUCTIONS,
  GOAL_LEVEL_POINTS,
  GOAL_REASON_POINTS,
  INTERVIEW_DELTA,
  JONGHAP_DELTA,
  LIKERT1_KEYS,
  LIKERT2_KEYS,
  MOCK_FILL_POINTS,
  OBSTACLE_DEDUCTIONS,
  OPTION_SOURCE_QUESTION,
  PAGE1_AREAS,
  PAGE2_AREAS,
  PROB_MAX,
  PROB_MIN,
  PROB_RANGE_LABELS,
  SCHEDULE_POINTS,
  SCHEMA_VERSION,
  SCORE_BANDS,
  SERVICE_BANDS,
  SERVICE_CODES,
  SERVICE_GRADE_FILTER,
  SERVICE_H3_LATE_CODES,
  SERVICE_H3_LATE_MONTH,
  SERVICE_LABEL,
  SERVICE_PART_CAPS,
  SERVICE_RULES,
  SINCERITY_MAX_OFFMODE,
  SINCERITY_MIN_ANSWERED,
  SINCERITY_OFFMODE_MIN_DISTANCE,
  STATE_TONE,
  TARGET_SCORE,
  TREND_POINTS,
  TYPE_RULES,
  URGENCY_AREA_THRESHOLD,
  URGENCY_BANDS,
  URGENCY_SCOPE,
} from "@/data/diagnosisScoringTable.js";
import {
  getOptionCode,
  renewalSurveyQuestions,
} from "@/data/renewalSurveyQuestions.js";

/* ================================================================== *
 * 0. 공통 유틸
 * ================================================================== */

/**
 * ROUND_HALF_UP (§4 서두 · B-01 정본 구현 · CASE-09) 재수출.
 * 구현은 의존 그래프의 리프인 diagnosisGradeScale.js 한 곳에만 있다 — 등급 변환표 룩업과
 * 채점이 같은 반올림을 쓰므로 사본을 두면 B-01 회귀 수정이 한쪽에만 반영된다.
 * §6.2 가 엔진 공개 API 로 지정한 이름이라 여기서 그대로 내보낸다.
 */
export { roundHalfUp };

/** 평균. 빈 배열이면 null(0 이 아니다 — 0 과 '자료 없음'은 다른 값이다). */
function meanOf(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/* ================================================================== *
 * 1. 응답 정규화 (§3)
 * ================================================================== */

/**
 * 라벨 → 선택지 서수 → 코드 2단 변환 (§3.5). 미지 라벨·미응답은 null.
 *
 * answers 는 OptionGroup 이 저장한 **라벨 문자열**이다. "라벨을 키로 쓰지 마라"(§3.5)를 지키면서
 * 이를 잇는 유일한 방법이 UI 가 렌더한 것과 같은 배열에서 서수를 얻는 것이라, 이 의존은 의도적이다
 * — 라벨 오탈자를 고치면 UI 와 채점에 동시에 반영된다. 대신 서수 계약이 깨지면 조용히 오채점되므로
 * §3.5 적재 검증식(q10=13지 / q12=14지 / q14=10지 / q9=q11=12문장)을 verify 스크립트 첫 항목에 둔다.
 *
 * 변환표를 여기서 다시 만들지 않고 문항이 들고 있는 optionCodes 를 getOptionCode 로 조회한다 —
 * OPTION_CODES 로 사본을 만들면 같은 계약이 두 소스가 되어 한쪽만 고쳐져도 조용히 오채점된다.
 * OPTION_CODES 는 감점표 키 계약과 적재 검증식의 기준으로만 남는다.
 */
function codeOf(group, value) {
  return getOptionCode(OPTION_SOURCE_QUESTION[group], value);
}

/** 복수선택. 미지 라벨은 조용히 버리고 중복은 접는다 — 감점 이중 계상을 막는다. */
function codesOf(group, values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  values.forEach((value) => {
    const code = codeOf(group, value);
    if (code != null) seen.add(code);
  });
  return [...seen];
}

/**
 * 리커트 방향 반전 (§3.3). UI 는 0='매우 그렇다', 배점표는 100='매우 그렇다'.
 * normalizeAnswers 내부 전용이다 — export 하면 엔진 입력이 점수인지 인덱스인지 계약이 모순된다(§6.2).
 */
function likertScore(columnIndex) {
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex > 4)
    return null;
  return 100 - 25 * columnIndex;
}

/**
 * 미응답 문장은 null 로 둔다 — 0 으로 채우면 '전혀 그렇지 않다'와 구분되지 않는다(§3.3).
 * LikertMatrix 는 statement.key 를 그대로 저장 키로 쓰고 q9·q11 의 statements 는 전부
 * {key,text} 로 승격돼 있으므로(적재 검증식이 못박는다) 저장 키 = 안정 키다.
 */
function normalizeLikert(raw, stableKeys) {
  const source = raw && typeof raw === "object" ? raw : {};
  const result = {};
  stableKeys.forEach((stableKey) => {
    result[stableKey] = likertScore(source[stableKey]);
  });
  return result;
}

/**
 * grade-grid 칸 → 그 칸을 숨기는 등급 체계 목록(§3.4 group.hiddenWhenGradeSystem).
 *
 * 표를 여기 복사하지 않고 문항 데이터에서 파생시킨다 — GradeInputGrid 가 숨기는 칸과 채점이
 * 무시하는 칸이 같아야 하는데, 사본을 두면 한쪽만 고쳐진다.
 */
const GRADE_FIELD_HIDDEN_SYSTEMS = new Map<string, string[]>(
  renewalSurveyQuestions
    .flatMap((question) => question.extra?.groups ?? [])
    .flatMap((group) =>
      // renewalSurveyQuestions는 원시 데이터 리터럴이라 이 시점 배열 원소가 가변 길이 배열로
      // 추론돼 Map 생성자의 튜플 이터러블 오버로드와 맞지 않는다 — 실제 셰이프([key, hiddenList])는
      // 데이터상 고정이므로 튜플로 캐스팅만 한다(값 자체는 그대로).
      (group.fields ?? []).map(
        (field) =>
          [field.key, group.hiddenWhenGradeSystem ?? []] as [string, string[]],
      ),
    ),
);

/**
 * grade-grid 는 값을 문자열로 저장한다. '' → null, 비수치 → null (NaN 차단).
 *
 * 등급 체계에서 숨겨지는 칸은 값이 남아 있어도 읽지 않는다. GradeInputGrid 는 체계를 바꿔도
 * 숨긴 그룹의 입력값을 **의도적으로 보존**하고(되돌릴 때 재입력을 없애기 위해) 그 근거로
 * "채점 계층이 등급 체계에 맞지 않는 칸을 무시한다"를 든다. 그 약속을 지키지 않으면 9등급제로
 * 모의고사를 채운 뒤 '중학생 평균'으로 바꿨을 때, 화면에서는 칸이 사라졌는데 교과 관리 aux 만
 * 5 → 10 으로 오르는 조용한 오채점이 된다.
 */
function gridNumber(raw, fieldKey, gradeSystem) {
  if (raw == null || raw === "") return null;
  if (GRADE_FIELD_HIDDEN_SYSTEMS.get(fieldKey)?.includes(gradeSystem))
    return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(raw) {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

/**
 * 원시 answers(라벨 문자열 맵) → DiagnosisInput (§3.1~§3.5).
 *
 * 미응답 필드는 null 이다(0 으로 채우지 않는다). 범위 검증은 하지 않는다 — §3.4 의 입력 검증은
 * UI 소관이고, §4.1 의 clamp 는 정의역 밖 값이 여기까지 왔을 때 발동하는 방어 규칙이라 역할이
 * 다르다. 여기서 미리 잘라내면 clamp 가 정상 경로에서 영영 발동하지 않는다.
 *
 * @param {Record<string, any>} answers SurveyStepShell 이 들고 있는 원시 응답
 * @param {{ diagnosedAt?: string|null, name?: string|null, attemptId?: string|null }} [meta]
 * @returns {object} DiagnosisInput
 */
export function normalizeAnswers(
  // SurveyStepShell 원시 응답 맵 — q1~q19 키마다 문항 타입이 달라(라벨 문자열/배열/grade-grid
  // 객체 등) unknown으로 좁히면 아래 source.qN 접근이 전부 캐스팅 지옥이 된다. JSDoc이 이미
  // 명시한 정본 타입(Record<string, any>) 그대로 옮긴다.
  // biome-ignore lint/suspicious/noExplicitAny: 위 주석 참고
  answers: Record<string, any>,
  meta: {
    diagnosedAt?: string | null;
    name?: string | null;
    // 리포트 영속화(diagnosis_reports) 저장·재시도 키 — SurveyStepShell이 제출
    // 플로우당 1회 만든 attemptId를 그대로 실어 둔다(리포트 페이지가 새로고침·재진입
    // 시 이 값을 읽어 ensureDiagnosisReportSaved 재시도에 쓴다). 저장 이전 payload와
    // 하위 호환을 위해 옵셔널이다 — 없으면 null.
    attemptId?: string | null;
  } = {},
) {
  const source = answers && typeof answers === "object" ? answers : {};
  const grid = source.q6 && typeof source.q6 === "object" ? source.q6 : {};
  const gradeSystem = codeOf("Q4_SYSTEM", source.q4);

  const mock = {
    korean: gridNumber(grid.mock_korean, "mock_korean", gradeSystem),
    math: gridNumber(grid.mock_math, "mock_math", gradeSystem),
    english: gridNumber(grid.mock_english, "mock_english", gradeSystem),
    social: gridNumber(grid.mock_social, "mock_social", gradeSystem),
    science: gridNumber(grid.mock_science, "mock_science", gradeSystem),
    history: gridNumber(
      grid.mock_korean_history,
      "mock_korean_history",
      gradeSystem,
    ),
  };

  const cascade =
    source.q15 && typeof source.q15 === "object" ? source.q15 : null;
  const admissionQuery =
    cascade?.university &&
    cascade.department &&
    cascade.admissionType &&
    cascade.detailType
      ? {
          university: cascade.university,
          department: cascade.department,
          admissionType: cascade.admissionType,
          detailType: cascade.detailType,
        }
      : null; // 4단이 전부 채워졌을 때만 객체다(§3.2)

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      // 시계를 읽지 않는다 — 제출 핸들러가 넣는다. 엔진이 Date.now() 를 부르면 순수성이 깨지고
      // 같은 입력이 매번 다른 리포트를 낸다(스냅샷 회귀 불가).
      diagnosedAt: meta.diagnosedAt ?? null,
      attemptId: meta.attemptId ?? null,
    },
    profile: {
      // TODO(Q-01): 이름을 수집하는 문항이 없다. 상시 null 이며 폴백은 §5.2 소관이다.
      name: meta.name ?? null,
      gradeLevel: codeOf("Q1_GRADE_LEVEL", source.q1),
      schoolType: codeOf("Q2_SCHOOL_TYPE", source.q2),
    },
    goal: {
      level: codeOf("Q3_LEVEL", source.q3),
      // q3 에서 '아직 구체적인 목표가 없어요'를 고르면 이유 문항이 노출되지 않아 상시 null 이다(§4.2.2).
      reason: codeOf("Q3_REASON", source["q3-target-reason"]),
      targetUniversity: textOrNull(source["q3-target-university"]),
      targetMajor: textOrNull(source["q3-target-major"]),
    },
    gradeSystem,
    scores: {
      naesinOverall: gridNumber(grid.overall_avg, "overall_avg", gradeSystem),
      recentExamAvg: gridNumber(
        grid.recent_exam_avg,
        "recent_exam_avg",
        gradeSystem,
      ),
      mock,
      mockFilledCount: Object.values(mock).filter((value) => value != null)
        .length,
    },
    gradeTrend: codeOf("Q8_TREND", source.q8),
    // 점수에는 쓰이지 않지만 코드로 담는다 — 이 값은 sessionStorage 로 영속화되므로 라벨 원문을
    // 넣으면 문항 1자 수정에 과거 응답이 미지 값이 된다(§3.5). TODO(Q-17): 축약 라벨 매핑은 미확정.
    trendSubject: codeOf("Q8_FOLLOWUP", source["q8-followup"]),
    likert1: normalizeLikert(source.q9, LIKERT1_KEYS),
    likert2: normalizeLikert(source.q11, LIKERT2_KEYS),
    obstacles: codesOf("OBSTACLE", source.q10),
    difficulties: codesOf("DIFFICULTY", source.q12),
    schedule: codeOf("SCHEDULE", source.q13),
    wishes: codesOf("WISH", source.q14),
    admissionQuery,
    csatMin: codeOf("Q16", source.q16),
    jonghapReady: codeOf("Q17", source.q17),
    interviewReady: codeOf("Q18", source.q18),
    freeText: typeof source.q19 === "string" ? source.q19 : "",
  };
}

/* ================================================================== *
 * 2. 등급 변환 (§4.1)
 * ================================================================== */

/**
 * 등급 체계 간 정규화 → 9등급 스케일 (§4.1 · CASE-06).
 *
 * 이 값은 §4.6 입결 비교 **전용**이다. 배점표 4번 주석("점수에는 반영되지 않습니다")대로
 * 12영역 점수·양 페이지 종합점수에는 절대 영향을 주지 않는다.
 *
 * @param {'NINE'|'FIVE'|'MIDDLE_AVG'|'UNKNOWN'|null} gradeSystem
 * @param {number|null} raw
 * @returns {number|null} 소수 2자리 또는 null(= 입결 섹션 전체 생략)
 */
export function convertToNineScale(gradeSystem, raw) {
  if (!isUsableNumber(raw)) return null;
  switch (gradeSystem) {
    case "NINE":
      return roundHalfUp(raw, 2); // 환산 없이 그대로
    case "FIVE":
      return fiveScaleToNine(raw);
    case "MIDDLE_AVG":
      return middleAvgToNine(raw);
    default:
      // UNKNOWN · 미응답(null)인 경우.
      return null;
  }
}

/**
 * F-16(2026-08-12 확정, Q-30 종결) — q1(학년)×q4(등급 체계) 응답 불일치는 검증하지 않는다.
 *
 * 예: 중3(M3)인데 9등급제(NINE)를 고르는 등 학년과 등급 체계가 통상 조합과 어긋나는 응답이
 * 있을 수 있다. 세 가지 처리안을 검토했다 — ① 설문에서 막기(다음 단계 진행 차단) ② 채점에서
 * 조용히 보정(예: 불일치 시 UNKNOWN 취급해 값 무효화) ③ 그대로 둔다. **③을 택했다.**
 *
 * 이유: (a) "통상 조합과 다르다"가 "틀렸다"의 증거가 아니다 — 조기입학·월반·검정고시 준비 등
 * 실제로 학년과 등급 체계가 어긋나는 학생이 존재할 수 있다(원문에 이런 예외를 배제하는 규칙이
 * 없다). (b) ①(진행 차단)은 정상 응답을 오류로 오인해 진단 자체를 막을 위험이 있다 — 학생을
 * 막는 결정은 이 진단에서 가장 신중해야 할 종류의 개입이다. (c) ②(조용한 보정)는 학생이 입력한
 * 실제 등급 값을 버려 F-12(gpa 미입력 표시)가 겪었던 것과 같은 "내 입력이 사라졌다"는 오인을
 * 재현한다. 따라서 q1×q4 조합을 검사하는 코드를 새로 만들지 않는다 — 이 함수의 분기도
 * gradeSystem 값 하나만 본다(q1 을 인자로 받지 않는다). 재검토 조건: 실제 불일치 응답 비율이
 * 유의미하게 확인되면 그때 경고(비차단) UI 를 검토한다 — 그때도 진행을 막지는 않는다.
 */

/* ================================================================== *
 * 3. 문항 → 영역 점수 (§4.2)
 * ================================================================== */

/** 모의고사 입력 칸수 → 교과 관리 aux 조회 (§4.2.2 · Q-09 확정, 6키 전부 룩업). */
function mockFillPoints(filledCount) {
  const count = Number.isInteger(filledCount) ? clamp(filledCount, 0, 6) : 0;
  return MOCK_FILL_POINTS[count] ?? 0;
}

/**
 * 영역별 보조 가산 aux (§4.2.1 표의 '보조 가산' 열).
 * 분기 근거는 AREA_AUX_SOURCE 데이터가 갖고 있다 — if 를 코드에 흩으면 표와 어긋나도 드러나지 않는다.
 */
function auxOf(area, input) {
  switch (AREA_AUX_SOURCE[area]) {
    case "GOAL_POINTS":
      // goal.reason == null 은 상시 경로다. ?? 0 이 없으면 aux = 20 + undefined = NaN 이 된다.
      return (
        (GOAL_LEVEL_POINTS[input.goal?.level] ?? 0) +
        (GOAL_REASON_POINTS[input.goal?.reason] ?? 0)
      );
    case "TREND":
      // 실치역 {2,3,5,8,10} — 6지 전부 2점 이상이라 '미응답 0' 경로가 없다(§4.2.1).
      return TREND_POINTS[input.gradeTrend] ?? 0;
    case "MOCK_FILL":
      return mockFillPoints(input.scores?.mockFilledCount);
    default:
      return 0;
  }
}

/** 척도 70점 파트. 2문장 중 응답한 것만으로 평균(분모 1 허용), 둘 다 결측이면 0 (§4.2 결측 · Q-10). */
function scalePartOf(area, likert) {
  const answered = (AREA_SCALE_MAP[area] ?? [])
    .map((key) => likert[key])
    .filter((value) => isUsableNumber(value));
  const mean = meanOf(answered);
  return mean == null ? 0 : mean * 0.7;
}

/** 체크 감점 합. 배타값(OBS_13 / DIF_14)은 area:null · points:0 이라 자연히 0 이다. */
function deductionOf(area, input) {
  let total = 0;
  (input.obstacles ?? []).forEach((code) => {
    const rule = OBSTACLE_DEDUCTIONS[code];
    if (rule?.area === area) total += rule.points ?? 0;
  });
  (input.difficulties ?? []).forEach((code) => {
    const rule = DIFFICULTY_DEDUCTIONS[code];
    if (rule?.area === area) total += rule.points ?? 0;
  });
  return total;
}

/**
 * 12영역 점수 (§4.2 · §4.2.1 · §4.2.2 · CASE-01 · CASE-08).
 *
 *   areaScore = roundHalfUp(clamp(scalePart + max(0, base + Σ감점) + aux, 0, 100), 0)
 *
 * `max(0, …)` 는 base 부분에만 씌운다 — 감점 합이 base 를 넘는 영역이 4곳 있는데(FEEDBACK −21,
 * PERFORM/INQUIRY/STRATEGY −31) aux 까지 함께 접으면 성적 흐름·모의고사 가산이 사라진다(§4.2.1).
 *
 * @param {object} input DiagnosisInput
 * @returns {Record<string, number>} 12영역 0~100 정수
 */
export function scoreAreas(input) {
  const likert = { ...(input?.likert1 ?? {}), ...(input?.likert2 ?? {}) };
  const safeInput = input ?? {};
  const result = {};
  AREA_CODES.forEach((area) => {
    const scalePart = scalePartOf(area, likert);
    const basePart = Math.max(
      0,
      (AREA_BASE[area] ?? 0) + deductionOf(area, safeInput),
    );
    const raw = scalePart + basePart + auxOf(area, safeInput);
    // 이 단계가 §4 서두가 허용한 두 반올림 지점 중 첫 번째다. §4.3·§4.4·§4.5 는 전부 이 정수를 받는다.
    result[area] = roundHalfUp(clamp(raw, 0, 100), 0);
  });
  return result;
}

/* ================================================================== *
 * 4. 영역 → 종합 · 구간 판정 (§4.3 · §4.4)
 * ================================================================== */

function areasOfPage(page) {
  return page === 2 ? PAGE2_AREAS : PAGE1_AREAS;
}

function scoreOf(areaScores, area) {
  const value = areaScores?.[area];
  return isUsableNumber(value) ? value : 0;
}

/**
 * 페이지 종합 준비도 (§4.3 · CASE-02).
 * 분모는 항상 6 이다 — 유효 영역 수로 줄이지 않는다(§4.3 결측, Q-10 정합 선택).
 *
 * @param {Record<string, number>} areaScores
 * @param {1|2} page
 * @returns {number} 소수 1자리
 */
export function overallScore(areaScores, page) {
  const areas = areasOfPage(page);
  const total = areas.reduce((sum, area) => sum + scoreOf(areaScores, area), 0);
  // 두 번째이자 마지막 반올림 지점(§4 서두 B-02).
  return roundHalfUp(total / areas.length, 1);
}

/** 5단계 등급 (§4.4 A · CASE-07). 경계는 상단 포함(>=)으로 통일 — 원문은 '80+'만 명시(Q-11). */
export function levelOf(score) {
  const value = isUsableNumber(score) ? score : 0;
  if (value >= SCORE_BANDS.L1) return "L1";
  if (value >= SCORE_BANDS.L2) return "L2";
  if (value >= SCORE_BANDS.L3) return "L3";
  if (value >= SCORE_BANDS.L4) return "L4";
  return "L5";
}

/** 영역 4상태 (§4.4 B · Q-32). 화면 라벨은 STATE_LABEL[page][state] 로 분리돼 있다. */
export function stateOf(score) {
  const value = isUsableNumber(score) ? score : 0;
  if (value >= AREA_BAND_THRESHOLDS.TOP) return "TOP";
  if (value >= AREA_BAND_THRESHOLDS.MID) return "MID";
  if (value >= AREA_BAND_THRESHOLDS.LOW) return "LOW";
  return "WEAK";
}

/**
 * 컴포넌트 tone 3색 (§7.3 · Q-32).
 * stateOf 에서 파생시킨다 — 별도 임계를 두면 Q-32 확정 시 라벨과 색이 어긋난다.
 */
export function toneOf(score) {
  return STATE_TONE[stateOf(score)] ?? "blue";
}

/**
 * 점수 오름차순 정렬. 동점이면 §4.2.1 영역 고정 순서(= 배열 인덱스)로 가른다.
 * diagnosisReport 도 traits·readiness 정렬에 이 함수를 쓴다 — 규칙을 두 벌로 두면 뱃지(엔진 정렬)와
 * 특성 카드(리포트 정렬)가 동점 구간에서 어긋난다.
 */
export function sortByScoreAsc(areas, areaScores) {
  return [...areas].sort((a, b) => {
    const diff = scoreOf(areaScores, a) - scoreOf(areaScores, b);
    return diff !== 0 ? diff : areas.indexOf(a) - areas.indexOf(b);
  });
}

/**
 * 우선순위 뱃지 (§4.4 C · §7.4.3).
 * 대상은 PAGE1 6영역뿐이다 — PAGE2 에는 부여하지 않는다(readiness.areas 는 뱃지 키가 없다).
 *
 * @returns {Array<{code: string, name: string, score: number, badge: string}>} 정확히 6개
 */
export function priorityBadges(areaScores) {
  return sortByScoreAsc(PAGE1_AREAS, areaScores).map((area, index) => ({
    code: area,
    name: AREA_LABEL[area],
    score: scoreOf(areaScores, area),
    badge: BADGES[index],
  }));
}

/**
 * 목표 점수 부족분 (§4.4 D · CASE-02 · Q-29).
 * gap <= 0 이면 reached=true — 호출부가 '목표까지 0점 부족'을 렌더하지 않도록 분기한다.
 */
export function targetGap(areaScores) {
  const [lowest] = sortByScoreAsc(PAGE1_AREAS, areaScores);
  const lowestScore = scoreOf(areaScores, lowest);
  const gap = TARGET_SCORE - lowestScore;
  return {
    lowestCode: lowest,
    lowestName: AREA_LABEL[lowest],
    lowestScore,
    gap,
    reached: gap <= 0,
  };
}

/**
 * 긴급도 (§4.4 E · CASE-03 · Q-12).
 *
 * 임계 40 은 다른 모든 경계(45/60/70/80)와 어긋나는 유일한 값이지만 원문 그대로다 —
 * AREA_BAND_THRESHOLDS(A1)를 뒤집어도 40 은 따라가면 안 된다.
 */
export function urgencyOf(input, areaScores) {
  // URGENCY_SCOPE는 §11 데이터 상수라 리터럴 타입("ALL_12")으로 좁게 추론된다 — 값이 다른
  // 시점(예: "PAGE1")일 수 있다는 이 분기의 전제를 지우지 않기 위해 비교 시에만 넓힌다.
  const scopeAreas =
    (URGENCY_SCOPE as string) === "PAGE1" ? PAGE1_AREAS : AREA_CODES;
  const lowAreaCount = scopeAreas.filter(
    (area) => scoreOf(areaScores, area) < URGENCY_AREA_THRESHOLD,
  ).length;
  const score = (SCHEDULE_POINTS[input?.schedule] ?? 0) + 10 * lowAreaCount;
  const level = (() => {
    if (score >= URGENCY_BANDS.L4) return "L4";
    if (score >= URGENCY_BANDS.L3) return "L3";
    if (score >= URGENCY_BANDS.L2) return "L2";
    return "L1";
  })();
  return { score, level, lowAreaCount };
}

/* ================================================================== *
 * 5. 서비스 추천 (§4.5)
 * ================================================================== */

/**
 * q19 자유서술 정서 신호 감지 (§4.5 원문 17번 · Q-36 해소로 배점과 분리, 사용자 확정 2026-08-11).
 *
 * 점수 계산에는 더 이상 쓰이지 않는다 — rankServices 는 이 함수를 호출하지 않는다. 오탐 특성을
 * 그대로 남긴다(부분 문자열 포함 매칭). '울' 한 글자가 '서울대'·'울산'에, '비교'·'혼자' 가
 * 부정문('비교하지 않으려 해요'·'혼자 있는 시간이 좋아요')에 걸린다. 이 신호는 그 자체로 결론이
 * 아니다 — 후속 판정자(사람 또는 LLM)가 "참고 후보"로만 읽어야 하는 신호다. 오탐이 섞인 채로
 * 학생 본인에게 노출하면 문구집 06_금지어의 진단·낙인 경계에 걸릴 수 있어, 이 값을 소비하는
 * diagnosisReport 는 저장·전달 전용으로만 싣고 렌더하지 않는다.
 *
 * @param {string} freeText DiagnosisInput.freeText(q19)
 * @returns {{ hit: boolean, matchedKeywords: string[] }}
 */
export function detectEmotionalSignal(freeText) {
  if (typeof freeText !== "string" || freeText.length === 0)
    return { hit: false, matchedKeywords: [] };
  const matchedKeywords = CALL_MENTOR_KEYWORDS.filter((keyword) =>
    freeText.includes(keyword),
  );
  return { hit: matchedKeywords.length > 0, matchedKeywords };
}

/**
 * diagnosedAt 의 월(1~12). 읽을 수 없으면 null.
 *
 * diagnosedAt 은 서버가 회원 시간대(profiles.time_zone)의 하루로 정해 넘기는 YYYY-MM-DD 문자열이다.
 * 월은 그 문자열의 앞부분에서 시간대 변환 없이 읽는다. 엔진은 시계를 읽지 않는다는 계약(모듈 서두)도
 * 그대로다 — Date 를 만들지 않으니 실행 환경 시간대를 타지 않고, 같은 입력은 항상 같은 월을 낸다.
 */
function diagnosedMonth(diagnosedAt) {
  if (typeof diagnosedAt !== "string") return null;
  const matched = diagnosedAt.match(/^\d{4}-(\d{2})-\d{2}/);
  if (!matched) return null;
  const month = Number(matched[1]);
  return month >= 1 && month <= 12 ? month : null;
}

/**
 * 서비스 후보 목록 (배점표 1번 · Q-13).
 *
 * 배점표 28행 원문 "고등학교 3학년 추천 서비스 후보 6종 전부 (6월 이후 가입은 2종)"을 구현한다.
 * 원문은 '가입'이라고 하지만 가입일은 진단 엔진 입력에 존재하지 않는다(비로그인 진단이 가능하고
 * meta 에 가입일 필드가 없다) — 실재하는 유일한 시각 소스인 제출 시각(meta.diagnosedAt)을
 * 대리 판정 소스로 쓴다.
 *
 * **fail-open**: 시각을 읽지 못하면(null · 파싱 실패) 제한하지 않고 6종 전부를 낸다. 시각을 못
 * 읽었다는 이유로 학생의 선택지를 줄이지 않는다.
 *
 * @returns {{ codes: string[], reason: 'H3_LATE'|'M3'|'RETAKE'|null }}
 *          reason 은 리포트 데이터에 실린다 — 가입일 ≠ 진단일 오차로 잘못 걸린 학생(3월 가입·7월
 *          진단)을 어드민·상담 단계에서 재판정하려면 판정 근거가 남아야 한다.
 */
export function serviceCandidates(gradeLevel, diagnosedAt) {
  if (gradeLevel === "H3") {
    const month = diagnosedMonth(diagnosedAt);
    return month != null && month >= SERVICE_H3_LATE_MONTH
      ? { codes: SERVICE_H3_LATE_CODES, reason: "H3_LATE" }
      : { codes: SERVICE_CODES, reason: null };
  }
  const fixed = SERVICE_GRADE_FILTER[gradeLevel];
  return fixed
    ? { codes: fixed, reason: gradeLevel }
    : { codes: SERVICE_CODES, reason: null };
}

/**
 * 서비스 적합도 순위 (§4.5 · CASE-05 · Q-13 해소 · Q-14 · Q-36 해소).
 *
 *   fit = min(50, 50×체크수/threshold) + (희망 교집합 ? 20 : 0) + 30 × (1 − mean(linkedAreas)/100)
 *
 * 콜멘토 자유서술 감지 단어 가산(+10)은 이 식에서 빠졌다(Q-36 해소, 사용자 확정 2026-08-11) —
 * 부분 문자열 매칭이 부정문·긍정 맥락·미탐을 구분하지 못하는데, 추천 구간 경계(80/65/50)를
 * 한 칸 넘겨 1순위 서비스를 바꿀 수 있는 건 근거 대비 과한 권한이라는 판단이다. 감지 자체는
 * detectEmotionalSignal() 로 분리해 별도 신호로만 낸다 — 실제 배점은 후속 작업(LLM 분류·어드민
 * 수동 배점) 몫이다.
 *
 * cap(min 50)은 여전히 방어 로직으로 남는다(B-03) — threshold < items.length 인 서비스(예:
 * GOAL_CARE 9개 항목/threshold 3)는 가산 없이도 체크수 비례식만으로 50을 넘을 수 있다
 * (9/3×50=150). fit <= 100 불변식의 근거이므로 cap 을 안쪽이 아니라 바깥에 씌운다.
 */
export function rankServices(input, areaScores) {
  const safeInput = input ?? {};
  const checked = new Set([
    ...(safeInput.obstacles ?? []),
    ...(safeInput.difficulties ?? []),
  ]);
  const wishes = new Set(safeInput.wishes ?? []);
  const { codes: candidates, reason: filterReason } = serviceCandidates(
    safeInput.profile?.gradeLevel,
    safeInput.meta?.diagnosedAt,
  );

  const all = candidates
    .map((code) => {
      const rule = SERVICE_RULES[code];
      if (!rule) return null;

      const checkedCount = rule.items.filter((item) =>
        checked.has(item),
      ).length;
      const difficultyPart = Math.min(
        SERVICE_PART_CAPS.difficulty,
        (SERVICE_PART_CAPS.difficulty * checkedCount) / rule.threshold,
      );
      const wishPart = rule.wishOptions.some((wish) => wishes.has(wish))
        ? SERVICE_PART_CAPS.wish
        : 0;
      const linkedMean =
        meanOf(rule.linkedAreas.map((area) => scoreOf(areaScores, area))) ?? 0;
      // 영역 점수가 0~100 정수라 areaPart 는 자연히 0~30 이지만, 상한을 명시해 불변식을 코드로 남긴다.
      const areaPart = clamp(
        SERVICE_PART_CAPS.area * (1 - linkedMean / 100),
        0,
        SERVICE_PART_CAPS.area,
      );
      // 반올림하지 않는다 — tier 판정은 원값으로 한다(§4.5 경계값). 표시용 반올림은 리포트 계층 몫.
      const fit = difficultyPart + wishPart + areaPart;
      const tier = (() => {
        if (fit >= SERVICE_BANDS.HIGH) return "HIGH";
        if (fit >= SERVICE_BANDS.MID) return "MID";
        if (fit >= SERVICE_BANDS.LOW) return "LOW";
        return null;
      })();
      const lowestLinkedArea = sortByScoreAsc(rule.linkedAreas, areaScores)[0];

      return {
        code,
        name: SERVICE_LABEL[code],
        fit,
        tier,
        difficultyPart,
        wishPart,
        areaPart,
        lowestLinkedAreaName: AREA_LABEL[lowestLinkedArea] ?? null,
      };
    })
    .filter((service) => service != null && service.tier != null)
    // 동점 타이브레이커는 SERVICE_CODES 표 순서 고정(§4.5 결측).
    .sort(
      (a, b) =>
        b.fit - a.fit ||
        SERVICE_CODES.indexOf(a.code) - SERVICE_CODES.indexOf(b.code),
    );

  // QA 시트 행 343(2026-09-02 확정) — 종전엔 second.fit >= SERVICE_RANK2_MIN_FIT(65) &&
  // rank1.fit - second.fit <= SERVICE_RANK2_MAX_DIFF(20) 게이트를 통과해야만 2순위가 채워져,
  // 후보가 둘 이상이어도 대부분 카드가 1장만 나왔다. QA 요청대로 게이트를 폐기하고 tier 필터를
  // 통과한 후보가 2개 이상이면 항상 2순위를 채운다(1개뿐이면 기존과 동일하게 1개, 0개면 SVC_NONE
  // 폴백 그대로).
  const rank1 = all[0] ?? null;
  const rank2 = all[1] ?? null;

  // filterReason 은 화면 분기용이 아니라 사후 재판정용이다(Q-13 가드레일) — 2종으로 줄어든 뒤
  // tier 필터까지 걸려 all 이 0건이 되면 기존 SVC_NONE 폴백이 그대로 동작하고, 그때도 '왜 2종
  // 이었는지'는 이 값에만 남는다.
  return { rank1, rank2, all, filterReason };
}

/* ================================================================== *
 * 6. 학생 유형 (§6.2 B-14)
 * ================================================================== */

/** 리커트 24문장 중 실제 응답값이 있는 것만. likertScore 도메인은 {0,25,50,75,100} 5개뿐이다. */
function likertValuesOf(input): number[] {
  return [
    ...Object.values(input?.likert1 ?? {}),
    ...Object.values(input?.likert2 ?? {}),
  ].filter((value): value is number => isUsableNumber(value));
}

/**
 * 최빈값 + 거리 기반 offmode 통계 (G-2 · WARN 2).
 *
 * 종전엔 "최빈값과 정확히 다른 값"을 전부 offmode 로 셌다 — 22개 '매우 그렇다'(100) + 2개
 * '그렇다'(75) 처럼 **인접 척도**(1칸 = 25점 차이) 응답까지 오탐으로 걸렸다(실측).
 *
 * 단순히 "거리가 먼 것만 개수에 센다"로는 이 오탐이 고쳐지지 않는다 — 22+2 예시는 애초에
 * 다른 값이 2개뿐이라, 그 2개를 거리로 걸러 세든 안 세든 결과는 항상 0 또는 2 이고, 어느 쪽도
 * SINCERITY_MAX_OFFMODE(2) 초과로 못 간다("<= 2" 판정이 항상 참으로 고정된다). 그래서 exported
 * `offmodeCount`(먼 응답 개수, 관리자 진단용)와 flagged 판정 로직을 분리한다 — flagged 는
 * `rawOffmodeCount`(최빈값과 다른 응답 전체 개수, 종전과 동일)와 `offmodeCount`(그중 먼 것만)를
 * **함께** 본다: 다른 응답이 있는데 전부 인접 척도뿐이면(= rawOffmodeCount > 0 && offmodeCount
 * === 0) 진짜 다양한 응답으로 보고 flagged 를 걷는다. 하나라도 먼 응답이 섞이면 종전 개수
 * 기준(rawOffmodeCount <= MAX_OFFMODE)으로 그대로 판정한다.
 */
function sincerityStats(input) {
  const values = likertValuesOf(input);
  const answered = values.length;
  if (answered === 0)
    return { answered, modeValue: null, offmodeCount: 0, rawOffmodeCount: 0 };
  const counts = new Map<number, number>();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  // 동률이면 먼저 등장한(=응답 순서상 앞선) 값을 최빈값으로 고정한다 — Map 이 삽입 순서를
  // 보존하므로 매 호출 결정론적이다.
  let modeValue: number | null = null;
  let modeCount = -1;
  counts.forEach((count, value) => {
    if (count > modeCount) {
      modeCount = count;
      modeValue = value;
    }
  });
  const rawOffmodeCount = answered - modeCount;
  // answered > 0(위에서 이미 0 분기를 반환)이므로 counts 는 비어있지 않고, 아래 forEach는
  // 항상 최소 1회 실행돼 modeValue 를 채운다 — non-null 단언은 그 보장을 타입으로만 반영한다.
  const offmodeCount = values.filter(
    (value) =>
      Math.abs(value - (modeValue as number)) >= SINCERITY_OFFMODE_MIN_DISTANCE,
  ).length;
  return { answered, modeValue, offmodeCount, rawOffmodeCount };
}

/**
 * 불성실(직선) 응답 판정 (F-15 · Q-16).
 *
 * 쓸 수 있는 신호가 리커트 24문장의 분포 하나뿐이다 — 응답 소요시간·IP·재응시 이력은 수집하지
 * 않고, 역채점 문항도 q9·q11 문장이 전부 같은 방향 서술이라 없다(§11 SINCERITY_MAX_OFFMODE 주석).
 *
 * "전부 동일"이 아니라 "대부분 동일"로 잡는 근거는 문구 원문 자체다 — SINCERITY_BANNER 가
 * "응답이 **대부분** 같은 항목으로 선택되어"라고 적혀 있다. 대신 표본 하한(20)을 둬서 몇 문장만
 * 답한 학생을 불성실로 몰지 않는다.
 *
 * G-2(2026-08-12) — 판정에 3단 분기가 생겼다(오탐 회귀 방지, sincerityStats 주석 참조).
 *   ① 변주가 아예 없다(rawOffmodeCount === 0) → 가장 의심스러운 경우, 항상 flagged.
 *   ② 변주는 있는데 전부 인접 척도(거리 < 50)뿐이다(offmodeCount === 0 인데 rawOffmodeCount > 0)
 *     → 진짜 다른 값을 준 적이 없다는 뜻이 아니라, 인접 칸을 오간 정상 편차다. flagged 아님.
 *   ③ 거리가 먼 응답이 하나라도 섞여 있다 → 종전과 같은 개수 기준(rawOffmodeCount <= MAX_OFFMODE).
 *
 * 이 판정은 **유형 배정만 보류시키고 점수는 무효화하지 않는다** — SINCERITY_TRAIT/ACT 원문이
 * "아래 내용은 영역별 점수만을 기준으로 정리한 것입니다"라고 명시하는 그대로다.
 *
 * @param {object} input DiagnosisInput
 * @returns {boolean}
 */
export function isStraightLining(input) {
  const { answered, offmodeCount, rawOffmodeCount } = sincerityStats(input);
  if (answered < SINCERITY_MIN_ANSWERED) return false;
  if (rawOffmodeCount === 0) return true;
  if (offmodeCount === 0) return false;
  return rawOffmodeCount <= SINCERITY_MAX_OFFMODE;
}

/**
 * 성실도 판정 결과 (F-15). diagnosisReport.buildNotices 가 SINCERITY_* 4문구를 조립할 때 읽는다.
 *
 * 소비자에게 불리언 하나(`flagged`)만 계약으로 준다 — 오탐이 보고되면 배너 하나를 끄는 것으로
 * 끝나야지, UI 가 임계값을 알고 있으면 되돌릴 곳이 두 군데가 된다. 나머지 두 필드는 어드민·검산
 * 진단용이며 화면에 쓰지 않는다.
 *
 * @returns {{ flagged: boolean, answeredCount: number, offmodeCount: number }}
 */
export function sincerityOf(input) {
  const { answered, offmodeCount } = sincerityStats(input);
  return {
    flagged: isStraightLining(input),
    answeredCount: answered,
    offmodeCount,
  };
}

/**
 * 8종 학생 유형 판정 (Q-05 · F-03, 나머지 4종 확정 2026-08-11).
 *
 * 문구집 01_유형문구 서술을 점수 조합으로 옮겨 8종 전량을 판정한다. 임계는 §11 TYPE_RULES 가
 * 소유하며 이 함수는 숫자를 갖지 않는다 — 원저자 답이 오면 표만 교체한다.
 *
 * 최초 매치 순서:
 *   ①  isStraightLining → null (F-15. SINCERITY 4문구가 대신 발화한다)
 *   ①' 리커트 응답이 전부 동일 → null (기존 가드 원형 보존 — 아래 주석 참조)
 *   ②  STABILITY < 45 → 학습 부담 누적형. 임계 45 는 배점표 영역 상태 취약 기준(§4.2.1) 그대로다.
 *   ③  PAGE1 최저 >= 70 && PAGE1 종합 >= 80 → 학습체계 안정형
 *   ④  PAGE1 산포(max−min) <= 10 → 균형 점검형
 *   ⑤  최저 영역 = GOAL     → 방향 탐색형
 *   ⑥  최저 영역 = TIME     → 시간관리 취약형
 *   ⑦  최저 영역 = FEEDBACK → 학습방법 점검형
 *   ⑧  PLAN >= 70 && EXEC < 60 → 계획 과잉·실행 취약형
 *   ⑨  GOAL >= 70 && PLAN < 70 && EXEC < 60 → 목표–실행 불균형형
 *   ⑩  그 외 → null (현행 폴백 유지 — 억지 배정을 하지 않는다)
 *
 * ①' 를 지운 것처럼 보이면 안 된다: 새 규칙은 표본 하한(20)이 있어 기존 규칙의 진부분집합이
 * **아니다**. 리커트 5문장만 답하고 전부 동일한 학생은 ①에 걸리지 않는다 — 기존 가드를 그대로
 * 남겨야 회귀가 0이 되고, 배너는 고신뢰 케이스에만 붙는다.
 *
 * ③④가 ⑤~⑦보다 앞서는 것은 **의도된 판정 변경**이다(버그로 되돌리지 마라).
 *   - 전 영역 70+ 인데 최저가 GOAL 이면 종전 DIRECTION_SEEK → 이제 SYSTEM_STABLE. GOAL 72('상위')
 *     학생에게 "무엇을 기준으로 공부할지 정해지지 않은 상태"라고 말하던 오판정의 교정이다.
 *   - 산포 10 이내 평탄 프로필은 종전 최저영역 유형 → 이제 BALANCED. 최저 영역 룩업은 "최저가
 *     유의미하게 낮다"를 전제하는데 평탄 프로필에서 그 전제가 깨진다.
 *   되돌리려면 ③④를 ⑦ 뒤로 내리면 된다(그때 ③은 거의 발화하지 않는다).
 *
 * 산포 <= 10 이면 PLAN−EXEC>10 · GOAL−EXEC>10 이 불가능하므로 ④·⑧·⑨는 서로 배타다 — 셋 사이의
 * 순서는 결과에 영향을 주지 않는다. 동점 타이브레이커도 신규 규칙 없이 sortByScoreAsc 의 기존
 * area 고정 순서 그대로다.
 */
export function classifyStudentType(input, areaScores) {
  if (isStraightLining(input)) return null;
  const answered = likertValuesOf(input);
  if (answered.length > 0 && answered.every((value) => value === answered[0]))
    return null;

  if (scoreOf(areaScores, "STABILITY") < 45) return "BURDEN_ACCUM";

  // min/max/산포는 새 헬퍼를 만들지 않고 기존 정렬 결과의 양 끝에서 뽑는다 — 정렬 규칙이 두 벌이
  // 되면 동점 구간에서 뱃지와 유형이 어긋난다.
  const ascending = sortByScoreAsc(PAGE1_AREAS, areaScores);
  const lowest = ascending[0];
  const lowestScore = scoreOf(areaScores, lowest);
  const highestScore = scoreOf(areaScores, ascending[ascending.length - 1]);

  if (
    lowestScore >= TYPE_RULES.SYSTEM_STABLE.page1MinArea &&
    overallScore(areaScores, 1) >= TYPE_RULES.SYSTEM_STABLE.page1Overall
  ) {
    return "SYSTEM_STABLE";
  }
  if (highestScore - lowestScore <= TYPE_RULES.BALANCED.spreadMax)
    return "BALANCED";

  if (lowest === "GOAL") return "DIRECTION_SEEK";
  if (lowest === "TIME") return "TIME_WEAK";
  if (lowest === "FEEDBACK") return "METHOD_REVIEW";

  const goal = scoreOf(areaScores, "GOAL");
  const plan = scoreOf(areaScores, "PLAN");
  const exec = scoreOf(areaScores, "EXEC");
  if (
    plan >= TYPE_RULES.PLAN_HEAVY.planMin &&
    exec < TYPE_RULES.PLAN_HEAVY.execMax
  )
    return "PLAN_HEAVY";
  if (
    goal >= TYPE_RULES.GOAL_EXEC_GAP.goalMin &&
    plan < TYPE_RULES.GOAL_EXEC_GAP.planMax &&
    exec < TYPE_RULES.GOAL_EXEC_GAP.execMax
  ) {
    return "GOAL_EXEC_GAP";
  }
  // ⑩ 최저가 PLAN·EXEC·STABILITY 이면서 ⑧⑨ 어디에도 안 걸리는 잔여 구간이 남는다.
  // 값을 창작해 메우지 않는다 — 현행 PAGE_GRADE_COPY 폴백이 그대로 뜬다.
  return null;
}

/* ================================================================== *
 * 7. 합격 가능성 (§4.6)
 * ================================================================== */

/**
 * 합격 구간 (§4.6 · CASE-04 · CASE-04b · Q-28).
 * mine 이 컷과 정확히 같으면 상위 구간으로 귀속한다(`<=`).
 *
 * Q-28 확정(2026-08-11) — 배점표 04는 '70%컷만 있을 때' 열의 안정 경계를 `70%컷 − 0.30`
 * 으로 정의하며 이는 `cut50 ≡ cut70 − 0.30` 의 대입이다. 이 결측 대체 항등식(및 그 역
 * `cut70 ≡ cut50 + 0.30`)을 그대로 반영해 4단 사다리 1벌로 통합한다. 둘 다 결측일 때만
 * null(BAND_NODATA) — 그 외에는 cut50 단독도 정상 산출된다.
 *
 * @returns {'STABLE'|'FIT'|'REACH'|'RISK'|null} null 은 BAND_NODATA 노출 신호다
 */
/**
 * 결측 대체 항등식으로 정규화한 컷 2개. 판정 불가면 null.
 *
 * admissionBand 와 successProbability 가 **같은 경계**를 봐야 해서 함수로 뽑았다 — 항등식 대입을
 * 두 곳에 적으면 확률이 밴드와 어긋나는 학생이 생긴다.
 *
 * 컷은 DB numeric(4,2) 라 .8 류 끝자리가 흔하고, JS 부동소수점 덧뺄셈은 정확하지 않다
 * (2.8 + 0.3 === 3.0999999999999996). 항등식 대입 직후 소수 2자리로 정규화해 경계에
 * 정확히 걸친 학생이 부동소수점 오차로 잘못된 밴드를 받지 않게 한다. roundHalfUp 재사용
 * — 새 반올림 헬퍼를 두지 않는다(모듈 서두 계약 2).
 */
function normalizedCuts(mine, cuts) {
  if (!isUsableNumber(mine)) return null;
  const cut50 = isUsableNumber(cuts?.cut50) ? cuts.cut50 : null;
  const cut70 = isUsableNumber(cuts?.cut70) ? cuts.cut70 : null;
  if (cut50 == null && cut70 == null) return null;
  return {
    c50: roundHalfUp(cut50 ?? cut70 - ADMISSION_MARGIN, 2),
    c70: roundHalfUp(cut70 ?? cut50 + ADMISSION_MARGIN, 2),
  };
}

export function admissionBand(mine, cuts) {
  const normalized = normalizedCuts(mine, cuts);
  if (normalized == null) return null;
  const { c50, c70 } = normalized;
  const reach = roundHalfUp(c70 + ADMISSION_MARGIN, 2);
  if (mine <= c50) return "STABLE";
  if (mine <= c70) return "FIT";
  return mine <= reach ? "REACH" : "RISK";
}

/**
 * 열린 구간 보정(%p) (F-01 · §11 ADMISSION_BAND_EDGE_ADJUST).
 *
 * STABLE(아래로 열림)과 RISK(위로 열림)는 밴드만으로는 "컷보다 1등급 여유"와 "컷 언저리"가 같은
 * 확률을 받는다. 그 둘만 가른다 — FIT·REACH 는 양끝이 닫힌 구간이라 보정하지 않는다.
 * 경계 폭은 새 숫자 없이 기존 ADMISSION_MARGIN 을 재사용한다.
 *
 * G-2(WARN 3, 2026-08-12) — RISK 방향은 문턱이 하나 더 있다. RISK_FAR 만 있던 종전엔 문턱을
 * 넘는 순간부터 거리와 무관하게 −5 에서 포화됐다(내신 3.41·5.00·9.00이 전부 같은 p). RISK_FAR
 * 조건보다 먼저 RISK_VERY_FAR 를 검사해 "많이 위험"과 "극단적으로 위험"을 가른다 — 두 조건 다
 * 참일 수 있는 구간(문턱 밖)이라 순서가 중요하다(넓은 조건을 나중에 검사해야 좁은 조건이 가려지지 않는다).
 */
function admissionBandEdge(band, mine, cuts) {
  const normalized = normalizedCuts(mine, cuts);
  if (normalized == null) return 0;
  const { c50, c70 } = normalized;
  if (band === "STABLE" && mine <= roundHalfUp(c50 - ADMISSION_MARGIN, 2)) {
    return ADMISSION_BAND_EDGE_ADJUST.STABLE_DEEP;
  }
  if (band === "RISK" && mine > roundHalfUp(c70 + 4 * ADMISSION_MARGIN, 2)) {
    return ADMISSION_BAND_EDGE_ADJUST.RISK_VERY_FAR;
  }
  if (band === "RISK" && mine > roundHalfUp(c70 + 2 * ADMISSION_MARGIN, 2)) {
    return ADMISSION_BAND_EDGE_ADJUST.RISK_FAR;
  }
  return 0;
}

/**
 * 입결 비교표 행 (§4.6 · §7.2 admission.rows).
 *
 * 라벨·'0.68등급 부족' 문자열은 만들지 않는다 — 엔진이 TEMPLATE_COPY 를 참조하면 문구 계층에
 * 역의존한다(모듈 서두 계약 1). 여기서는 key/value/diff 구조만 내고 문자열화는 diagnosisReport 가 한다.
 *
 * @returns {Array<{key: string, value: number, diff: number|null, emphasis: boolean}>} 값이 null 인 행 제외, 최대 4행
 */
export function admissionRows(mine, cuts) {
  const values = {
    cut50: cuts?.cut50,
    cut70: cuts?.cut70,
    avg: cuts?.finalAvg,
    mine,
  };
  const mineValue = isUsableNumber(mine) ? roundHalfUp(mine, 2) : null;

  return ADMISSION_ROW_KEYS.filter((key) => isUsableNumber(values[key])).map(
    (key) => {
      const value = roundHalfUp(values[key], 2);
      return {
        key,
        value,
        // 내 성적 행은 기준점이라 차이가 없다. mine 이 없으면 비교 자체가 성립하지 않는다.
        diff:
          key === "mine" || mineValue == null
            ? null
            : roundHalfUp(mineValue - value, 2),
        emphasis: key === "mine",
      };
    },
  );
}

/**
 * 합격 확률 (§4.6 · §5.3 · F-01 · Q-03 · Q-04).
 *
 *   p = clamp(BASE[band] + EDGE + (14번 + 15번 + 16번 가감), PROB_MIN, PROB_MAX)
 *
 * 기준값·보정값은 §11 이 소유한다(이 함수에는 숫자가 없다). 전역 단일 BASE_PROBABILITY 는
 * 폐기했다 — 하나의 값으로는 밴드 4개를 구분할 수 없어 안정권과 위험권이 같은 확률을 받았다.
 *
 * 결정적(deterministic)이며 단조롭다: 같은 학생(14~16번 응답 고정)에서 내신이 나빠질수록 p 는
 * 절대 올라가지 않는다. 밴드 기준값 간격(20)이 EDGE 최대 폭(10, G-2 RISK_VERY_FAR 확장 후)보다
 * 커서 보정이 순서를 못 뒤집고, clamp 는 단조 함수라 가감을 더해도 순서가 보존된다. 내신
 * 1.00~6.00 을 0.01 단위로 스윕하고 가감 조합 전량(−30~+15)을 곱해 실측한 결과 역전 0건이었다.
 *
 * 가능한 p 는 5의 배수 19개(5,10,…,95)뿐이다 — 기준값·EDGE·가감이 전부 5의 배수라 스냅이 불필요하다.
 *
 * 상한 PROB_MAX 는 반드시 100 미만이어야 한다 — 100 이 되는 순간 렌더 문자열이
 * '합격 가능성 예측 100%'가 되어 06_금지어 '결과 단정'의 "100%"와 문자 그대로 일치한다.
 * 학생 화면에는 이 정수를 그대로 쓰지 말고 probabilityRangeLabel 로 구간화해 내보낸다.
 *
 * @param {object} input DiagnosisInput
 * @param {'STABLE'|'FIT'|'REACH'|'RISK'|null} band admissionBand 결과
 * @param {number|null} [mine] 9등급 정규화 내신. cuts 와 함께 생략하면 EDGE = 0 (하위호환)
 * @param {{cut50: number|null, cut70: number|null}|null} [cuts]
 * @returns {number|null} null 은 '자료 없음' 신호다(추정치를 만들지 않는다)
 */
export function successProbability(input, band, mine, cuts) {
  // 구간을 못 낸 상태(입결 미조회·자료 없음)에서는 확률의 기준 자체가 없다 → '자료 없음'으로 떨어뜨린다.
  if (band == null) return null;
  const base = ADMISSION_BAND_BASE_PROBABILITY[band];
  if (!isUsableNumber(base)) return null;
  const delta =
    (CSAT_MIN_DELTA[input?.csatMin] ?? 0) +
    (JONGHAP_DELTA[input?.jonghapReady] ?? 0) +
    (INTERVIEW_DELTA[input?.interviewReady] ?? 0);
  return clamp(
    base + admissionBandEdge(band, mine, cuts) + delta,
    PROB_MIN,
    PROB_MAX,
  );
}

/**
 * 확률 → 학생 노출용 구간 라벨 (F-01 · §11 PROB_RANGE_LABELS).
 *
 * 점추정 %를 그대로 내보내지 않기 위한 유일한 출구다. 산술을 하지 않고 명시 테이블을 최초 매치로
 * 훑는다 — 계산식으로 만들면 PROB_MAX 가 100 이 되는 순간 '90~100%'가 되살아나 06_금지어
 * '결과 단정'의 "100%"와 문자 그대로 일치한다. 표에는 '100'도 '0%'도 구조적으로 존재하지 않는다.
 *
 * @returns {string|null} p 가 없으면 null — 호출부는 밴드 4글자/'자료 없음' 폴백을 유지한다
 */
export function probabilityRangeLabel(probability) {
  if (!isUsableNumber(probability)) return null;
  return (
    PROB_RANGE_LABELS.find((entry) => probability >= entry.min)?.label ?? null
  );
}
