/**
 * DiagnosisInput → ReportData 조립 — 명세 §7(리포트 컴포넌트 연결) 전담.
 *
 * 계층 규칙(§6.2 · §10 T15/T16 책임 경계)
 *   diagnosisScoring.js      : 코드·수치만 낸다.
 *   diagnosisCopyBinding.js  : 코드 → 문구 조회 + 토큰 치환.
 *   diagnosisReport.js(여기) : 위 둘을 합쳐 컴포넌트가 그대로 렌더할 문자열을 완성한다.
 * 여기에는 채점 규칙·경계값·문구 원문을 다시 쓰지 않는다 — 값이 두 곳에 있으면 한쪽만 고쳐진다.
 * 단위 문자열('점' · '등급' · '/100')은 엔진 쪽 책임이라 여기서 붙인다(§7.4.3 — 컴포넌트는 단위를 모른다).
 *
 * React 를 import 하지 않는 순수 함수 모듈이다. 시계도 읽지 않는다(diagnosedAt 은 입력이 들고 온다).
 * verify 스크립트가 plain node 로 그대로 import 한다.
 *
 * 결측 정책: 예외를 던지지 않는다. 값이 없으면 §5.2/§7.2 가 지정한 폴백으로 떨어뜨리고,
 * 폴백이 지정되지 않은 자리는 문구를 창작하는 대신 해당 요소를 뺀다. 다만 §7.4.3 불변식
 * (learningAxes 6 · readiness.areas 6 · summaryCards 3 · admission 5키 · rows 배열)은 항상 지킨다 —
 * AdmissionSection 은 admission 을 무조건 구조분해하고 rows.map 을 돌기 때문에 null 이면 흰 화면이 된다.
 */

import {
  ADMISSION_BAND_COPY,
  ADMISSION_BAND_LABEL,
  COPY_FALLBACK,
  TYPE_COPY,
  URGENCY_COPY,
} from "@/data/diagnosisCopy.js";
import {
  AREA_CODES,
  AREA_LABEL,
  LEVEL_LABEL,
  PAGE1_AREAS,
  PAGE2_AREAS,
  PROB_DISPLAY_MODE,
  SERVICE_LABEL,
  STATE_LABEL,
  STRENGTH_THRESHOLD,
  TARGET_SCORE,
  URGENCY_AREA_THRESHOLD,
  URGENCY_LEVEL_LABEL,
} from "@/data/diagnosisScoringTable.js";
import { renewalSurveyQuestions } from "@/data/renewalSurveyQuestions.js";
import {
  areaCopy,
  commonCopy,
  fill,
  levelCopy,
  narrativeCopy,
  serviceCopy,
  templateCopy,
} from "./diagnosisCopyBinding.js";
// 확장자 .js 명시 — verify 스크립트가 plain node ESM 으로 직접 import 한다(확장자 생략 해석 불가).
import {
  admissionBand,
  admissionRows,
  classifyStudentType,
  convertToNineScale,
  detectEmotionalSignal,
  levelOf,
  overallScore,
  priorityBadges,
  rankServices,
  scoreAreas,
  sincerityOf,
  sortByScoreAsc,
  stateOf,
  successProbability,
  targetGap,
  toneOf,
  // 함수명과 출력 키(admission.probabilityRangeLabel = 라벨 문자열)가 헷갈리지 않게 별칭을 준다.
  probabilityRangeLabel as toProbabilityRange,
  urgencyOf,
} from "./diagnosisScoring.js";

/* ================================================================== *
 * -1. 로컬 타입 — diagnosisScoring.js(미변환 JS, hard 버킷)가 낳는 값의 정확한
 * 셰이프는 그 엔진 소유이고 이 배치 범위 밖이다(FreeDiagnosisReport.tsx의 동일
 * 판단 참고). 아래는 이 파일이 실제로 읽는 필드만 최소로 좁힌 로컬 타입이다.
 * export 하지 않는다(신규 공유 타입 파일 금지 원칙과 같은 이유로, 이 파일
 * 내부에서만 쓴다).
 * ================================================================== */

type DiagnosisInputLike = {
  profile?: {
    name?: string | null;
    gradeLevel?: string | null;
    schoolType?: string | null;
  } | null;
  goal?: { targetMajor?: string | null } | null;
  gradeSystem?: "NINE" | "FIVE" | "MIDDLE_AVG" | "UNKNOWN" | null;
  gradeTrend?: string | null;
  scores?: { naesinOverall?: number | null } | null;
  meta?: { diagnosedAt?: string | null } | null;
  admissionQuery?: {
    university?: string | null;
    department?: string | null;
    admissionType?: string | null;
  } | null;
  freeText?: string | null;
  likert1?: Record<string, number | null> | null;
  likert2?: Record<string, number | null> | null;
};

type AreaScores = Record<string, number>;

type BuildReportCtx = {
  cuts?: {
    cut50: number | null;
    cut70: number | null;
    finalAvg: number | null;
  } | null;
  cutsError?: boolean;
  admissionMeta?: { year?: string | number | null } | null;
};

/* ================================================================== *
 * 0. 이 파일이 소유하는 최소 상수
 * 문구집·배점표 어디에도 집이 없어 여기 둘 수밖에 없는 값만 남긴다.
 * ================================================================== */

/**
 * 추천 카드 순위 라벨(§7.2 recommendations). 문구집 문자열이 아니라 카드 제목의 구조 라벨이고,
 * BADGES(우선순위 뱃지)와 문자열이 같지만 의미가 달라 재사용하지 않는다 — 뱃지 라벨이 바뀌어도
 * 서비스 순위 표기는 따라가면 안 된다.
 */
const RANK_LABELS = ["1순위", "2순위"];

/**
 * 문구집에 대응 문장이 없어 이 파일이 잠정으로 갖는 사용자 노출 문자열.
 * 문구집 개수 검산(344 + 22)에 섞이면 안 되므로 diagnosisCopy 로 옮기지 않고 여기 격리한다.
 * 문구가 발주되면 COPY_FALLBACK 으로 이사한다. export 하지 않는다 — 소비자가 이 파일뿐이다.
 *
 * TODO(Q-04 · Q-28): BAND_VALUE_NODATA 는 입결 자료가 없어 밴드조차 못 낼 때의 값 슬롯이다
 *   (문구집 BAND_NODATA 는 summary 용 장문이라 이 자리에 쓸 수 없다).
 * TODO(Q-01): TRAITS_HEADING_ANON 은 이름 미수집 상태의 section_traits 축약형이다(§5.2 name 결측).
 * TODO(Q-04): PROBABILITY_LABEL 은 admission_headline 에서 '{prob}%' 접두를 잘라 쓰는 경로가
 *   실패했을 때(문구집이 '{prob}% 합격 가능성' 류로 바뀌면 접두가 빈 문자열이 된다) 쓰는 라벨이다.
 */
const REPORT_FALLBACK = {
  BAND_VALUE_NODATA: "자료 없음",
  TRAITS_HEADING_ANON: "주요 학습 특성",
  PROBABILITY_LABEL: "합격 가능성",
};

/**
 * F-07(2026-08-12 확정) — 강점·보완 카드 개수 상한과 집계 대상.
 *
 * 개수(3·4)는 **혼합** 근거다: 시안이 확정한다(2967:8227~8229 강점 3장, 2967:8251~8254 보완
 * 4장 — 승인된 픽스처와 A4 박스 높이가 이 개수로만 한 페이지에 들어간다). 대상 범위만 **자체
 * 결정**이다 — §5.1 원문은 '2페이지 강점'이라 적었으나 이는 강점 문구(02 시트)가 실린 시트
 * 이름일 뿐, 문구 자체(AREA_COPY.strength/weakness)는 12영역 전부에 이미 작성돼 있다. PAGE2
 * 6영역으로 좁히면 학습 실행 역량(PAGE1) 쪽 강점이 하나도 카드에 오를 수 없어(예: 계획·실행이
 * 뛰어난 학생) 강점 섹션의 취지(학생이 잘하는 것을 알려준다)와 어긋난다 — 12영역 전체를
 * 확정으로 채택한다. 관련 Q-07.
 */
const STRENGTH_MAX = 3;
const IMPROVEMENT_MAX = 4;
const STRENGTH_SCOPE = AREA_CODES;
const IMPROVEMENT_SCOPE = AREA_CODES;

/** 주요 학습 특성 카드 수(§7.2 traits 3블록). PAGE1 하위 3영역을 쓴다. */
const TRAIT_COUNT = 3;

/* ================================================================== *
 * 0-B. 자체 결정 상수 — 표시 계층 전용 단일 테이블
 *
 * 배점표·문구집·시안 어디에도 근거가 없어 **우리가 정한** 값만 여기 모은다. 로직에 인라인하지
 * 않는다 — 원저자 답이 오면 이 객체의 해당 키만 교체하면 끝나야 한다.
 *
 * 집 위치에 대한 메모(구현자 판단, 2026-08-11): 결정문은 이 값들의 집으로 신규 파일
 * `src/data/diagnosisSelfDecided.js` 를 지목했으나, 그 파일은 다른 담당(UI 배치)이 같은 턴에
 * 만들기로 돼 있어 양쪽이 각자 Write 하면 한쪽이 통째로 덮인다. 이 파일 안에 격리하면 그 위험이
 * 0 이고, 파일이 실제로 생기면 이 객체를 통째로 옮기고 import 한 줄로 바꾸면 된다(값 수정 없음).
 * 그때까지 값이 두 벌로 갈라지지 않도록 **여기가 유일한 정의처**임을 명시한다.
 * ================================================================== */

export const SELF_DECIDED = Object.freeze({
  /**
   * 자체 결정(2026-08-12) 확정. 원본 근거 없음, 신규 발주 대기. 변경 시 이 값만 교체. 관련 Q-33 · F-12
   *
   * UNKNOWN 등급 체계의 접미사. 종전엔 '미입력'이었으나 GRADE_SYSTEM_INPUT_RULES.UNKNOWN 이
   * NINE 과 **동일 규격**(1~9 · 소수 2자리)이라 입력값은 이미 등급 형태다 — 정성껏 입력한 값이
   * '미입력'으로 뜨면 학생은 자기 입력이 무시됐다고 읽는다.
   * 폭 제약(구현자 실측으로 정정, 2026-08-11): 결정문은 "NINE 과 동일하게 12자"라 했으나 공백을
   * 빠뜨린 오산이다(실제 14자). 글자 수가 아니라 렌더 폭이 제약이라 직접 쟀다 —
   * Pretendard Variable 500 · 16px 기준 '3.24등급(체계 미확인)' = 145.4px 로, 값 칸
   * lg:w-[12.5rem](200px) 안에서 1줄(높이 20px)이다. NINE 표기는 123.8px.
   * 즉 **여유는 54.6px** 이며, 접미사를 바꿀 때 이 안에 들어야 한다(넘치면 2줄로 접혀 정보 행이 밀린다).
   */
  GPA_UNKNOWN_SUFFIX: "등급(체계 미확인)",

  /**
   * 자체 결정(2026-08-12) 확정. FLAT('정체')만 시안 2967:8107 인용이고 나머지 5종은 원본 근거
   * 없음, 신규 발주 대기. 변경 시 이 표만 교체. 관련 Q-17 · F-14
   *
   * q8 원문 라벨은 최장 236.9px 로 w-[12.5rem](200px) 안에서 2줄로 접힌다(실측). 어휘는 원문에서
   * 그대로 잘라 왔고, '대부분/일부' 대비쌍은 UP_MOST 와 UP_PART 가 같은 라벨로 무너지지 않도록 보존했다.
   */
  GRADE_TREND_SHORT_LABEL: Object.freeze({
    UP_MOST: "대부분 상승",
    UP_PART: "일부 상승",
    FLAT: "정체",
    DOWN_PART: "일부 하락",
    VOLATILE: "과목별 변동",
    NO_DATA: "비교 자료 부족",
  }),

  /**
   * 자체 결정(2026-08-11) — 표기 확장 2종. 관련 F-19
   *
   * DB main_track 은 축약형('교과'·'종합')이고 시안·문구집(BAND_NODATA)·대교협 표준은 확장형을
   * 쓴다. **표시 경로에서만** 쓰며 조회 키는 절대 이 표를 거치지 않는다 — 매핑이 틀려도 입결
   * 조회가 깨질 수 없다. 매핑에 없는 값(실측 '논술' 3행 · '실기' 56행)은 원값 그대로 통과시킨다.
   * 이 객체를 {} 로 비우면 전량 DB 원값 통과(순수 passthrough)로 즉시 롤백된다.
   */
  ADMISSION_TYPE_DISPLAY: Object.freeze({
    교과: "학생부교과",
    종합: "학생부종합",
  }),

  /**
   * 자체 결정(2026-08-12) 확정. 문구집에 대응 문장 없음(원본 근거 없음, 신규 발주 대기). 변경 시
   * 이 값만 교체. 관련 F-06 / Q-13
   *
   * 고3 6월 이후 진단자의 서비스 후보가 2종으로 줄어드는 이유를 밝히는 안내다. 06_금지어
   * '공포 마케팅' 대체 표현('남은 기간 안에 가능한 것부터')의 어법을 따랐고, 같은 계열의 서비스
   * 제한 안내인 05_구간_공통 SVC_M3_LIMIT('… 위닝 목표관리와 위닝 콜멘토 두 가지가 추천
   * 대상입니다')의 어휘·문형에 맞췄다.
   */
  SERVICE_H3_LATE_NOTICE:
    "고등학교 3학년 6월 이후에는 남은 기간 안에 바로 실행할 수 있는 위닝 목표관리와 위닝 콜멘토 두 가지를 우선 안내드립니다.",

  /**
   * 자체 결정(2026-08-12) 확정. 문구집에 대응 문장 없음(원본 근거 없음, 신규 발주 대기). 변경 시
   * 이 값만 교체. 관련 F-09
   *
   * 입결 비교표가 3행뿐인 것이 '로딩 실패'로 보이지 않게 하는 화면 전용 캡션이다. '최종등록자
   * 평균'은 원본에 **존재하지 않는** 값이라(모집단이 다른 grade_avg 계열로 대체 금지) 영구 미렌더다.
   * 어휘는 05_구간_공통 BAND_NODATA('공개된 입결 자료가 없어…')의 '공개된 입결 자료' 표현을 그대로 이었다.
   */
  ADMISSION_FINAL_AVG_OMITTED:
    "공개된 입결 자료에는 최종등록자 평균이 포함되어 있지 않아 표에서 제외했습니다.",

  /**
   * 06_금지어 '결과 단정' 행의 **대체 표현 열 원문 인용** — 신규 발주가 아니다. 관련 F-01
   * (BANNED_PHRASES 를 런타임 조회하지 않는 이유: alternatives 배열의 순서에 의존하게 되어
   *  문구집 편집 한 번에 화면 문자열이 조용히 바뀐다. 대신 verify 가 두 값의 일치를 단언한다.)
   */
  PROB_RANGE_HEADING: "합격 가능성 예상 범위",
  PROB_REFERENCE_BADGE: "참고 결과",

  /**
   * 자체 결정(2026-08-12) 확정 — 원본 근거 없음, 신규 발주 대기. 변경 시 이 값만 교체. 관련 G-1c
   *
   * 입결 비교표 'mine' 행이 9등급 환산값(§4.1 convertToNineScale)일 때만 붙는 접미어다.
   * 5등급제(FIVE)·중학생 평균(MIDDLE_AVG) 학생은 학생정보 블록에 원값('3.00등급(5등급제)'
   * 등)이 뜨고, 같은 화면 입결표에는 9등급 환산값('4.78등급')이 별도 표기 없이 뜬다 — 같은
   * 이름의 값이 다른 숫자로 두 번 보여 오류로 오인될 수 있다(WARN G-1c 실측). 9등급제(NINE)
   * 학생은 두 값이 항상 같으므로 접미어를 붙이지 않는다(조건부 생략).
   */
  ADMISSION_MINE_CONVERTED_SUFFIX: "(9등급 환산)",
});

/**
 * (해소됨 · 2026-08-11) AREA_COPY.levels 60문구 + AREA_COPY.strategies 48문구는 종전에 어느
 * 슬롯에도 바인딩되지 않아 통째로 죽어 있었다. F-04 확정으로 **화면 전용 확장 영역**(A4 시트
 * 2장 아래, `@media print` 에서 제외)에 싣는다 — buildAreaDetails / buildStrategyGroups.
 *
 * 승인된 A4 2장 레이아웃을 건드리지 않는 이유가 핵심이다: 인쇄 페이지 하단 여유가 1p 71.0px ·
 * 2p 52.6px 뿐이라 시트 안에 108문구를 넣을 자리가 물리적으로 없다. 화면은 세로 제약이 없다.
 * 따라서 이 두 키를 **인쇄 슬롯에 다시 옮기지 마라** — 옮기는 순간 2장이 3장이 된다.
 *
 * 아직 남은 보류: TYPE_COPY.detail 8건 + todos 24건(F-03). 8종 판정이 방금 완성됐지만 자리를
 * 예약만 해 두고 이번 범위에서 렌더하지 않는다 — 자리는 결정문에 있고 studentType 코드로 조회한다.
 */

/* ================================================================== *
 * 1. 조회 · 포맷 유틸
 * ================================================================== */

const QUESTION_BY_ID = new Map(
  renewalSurveyQuestions.map((question) => [question.id, question]),
);

/**
 * 코드 → 선택지 라벨 역변환(§7.2 "q1 / q2 라벨 그대로").
 * DiagnosisInput 은 라벨을 보존하지 않으므로 UI 가 렌더한 것과 같은 배열에서 되찾는다 —
 * 라벨 상수를 여기 복사해 두면 문항 문구를 고칠 때 리포트만 옛 문자열로 남는다.
 */
function optionLabelOf(questionId, code) {
  if (code == null) return null;
  const question = QUESTION_BY_ID.get(questionId);
  const index = question?.optionCodes?.indexOf(code) ?? -1;
  if (index === -1) return null;
  // index !== -1이면 위 optionCodes?.indexOf가 성공했으므로 question은 항상 존재.
  // renewalSurveyQuestions 원본 데이터의 options 원소는 문자열 배열의 유니온으로 좁게
  // 추론돼(never로 collapse) object 형태 옵션 분기가 타입상 막히므로 명시 캐스팅으로 되돌린다.
  const option = question!.options?.[index] as
    | string
    | { label?: string; value?: string }
    | undefined;
  return typeof option === "string"
    ? option
    : (option?.label ?? option?.value ?? null);
}

/** 값이 없으면 '미입력'(§7.2 가 명시한 유일한 노출 폴백). 빈 문자열이 화면에 나가지 않게 하는 관문이다. */
function orMissing(value) {
  return value == null || value === "" ? COPY_FALLBACK.VALUE_MISSING : value;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 전체 평균 내신 표기(§7.2). **원값을 표기한다** — 9등급 환산값(§4.1)은 입결 비교 전용이라
 * 여기에 쓰면 중학생 87.5점이 '2.75등급'으로 둔갑한다.
 */
function formatGpa(gradeSystem, raw) {
  if (!isNumber(raw)) return COPY_FALLBACK.VALUE_MISSING;
  switch (gradeSystem) {
    case "NINE":
      return `${raw.toFixed(2)}등급(9등급제)`;
    case "FIVE":
      return `${raw.toFixed(2)}등급(5등급제)`;
    case "MIDDLE_AVG":
      return `${raw.toFixed(1)}점`;
    default:
      // UNKNOWN — F-12 확정(2026-08-11). 종전 주석('체계를 모르면 단위를 붙일 수 없다')의 전제가
      // 틀렸다: 입력 마스크(GRADE_SYSTEM_INPUT_RULES.UNKNOWN)가 NINE 과 동일 규격이라 값은 이미
      // 1~9 등급 형태로 들어온다. 즉 '단위를 못 붙이는 값'이 아니라 '9등급제로 확인되지 않은 등급'이다.
      // **표시만 살린다** — convertToNineScale 의 UNKNOWN → null 은 절대 건드리지 않는다.
      // 여기를 함께 바꾸면 체계 미상 값이 9등급 컷과 직접 비교되어 밴드·확률이 통째로 오염된다.
      return `${raw.toFixed(2)}${SELF_DECIDED.GPA_UNKNOWN_SUFFIX}`;
  }
}

/**
 * 성적 흐름 표기(§7.2 · F-14). q8 원문 라벨은 StudentInfoBlock 의 w-50 안에서 2줄로 접혀
 * 행 높이를 밀어낸다(최장 236.9px 실측) → 축약 라벨을 쓰되 **표시 전용**이다.
 * 채점은 optionCodes 로만 하므로 라벨 교체가 점수에 영향을 줄 수 없다.
 * 매핑에 없는 코드는 q8 원문 라벨로 되돌린다 — 선택지가 늘어나도 빈 칸이 되지 않는다.
 */
function formatGradeTrend(code) {
  return (
    SELF_DECIDED.GRADE_TREND_SHORT_LABEL[code] ?? optionLabelOf("q8", code)
  );
}

/** 제출 시각 → 'YYYY.MM.DD'(§7.2). 파싱 실패는 null 로 떨어뜨려 호출부가 '미입력'을 쓰게 한다. */
function formatDiagnosedAt(value) {
  if (typeof value !== "string" || value === "") return null;
  const matched = value.match(/^(\d{4})[-./](\d{2})[-./](\d{2})/);
  if (matched) return `${matched[1]}.${matched[2]}.${matched[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}.${month}.${day}`;
}

/* ================================================================== *
 * 2. 페이지 1 섹션
 * ================================================================== */

/**
 * 헤드라인(§5.2 headline · §7.2 · F-03 · F-15).
 *
 * Q-05 확정(2026-08-11) — 유형 판정이 8종 전량으로 확장됐다(엔진 classifyStudentType). 그래도
 * 판정 불가 구간은 남고, 그때는 PAGE1 종합 등급 문구로 떨어진다(억지 배정 금지).
 * 이름 미수집(Q-01)이면 '{name} 학생, ' 접두는 통째로 빠진다 — 토큰 원문이 화면에 도달하면 안 된다.
 *
 * F-15 — 불성실(직선) 응답으로 판정되면 유형 문구·등급 문구 대신 SINCERITY_HEAD 로 **치환**한다
 * (추가가 아니라 치환이다 — 인쇄 1페이지 하단 여유가 71.0px 뿐이라 줄 수를 늘릴 수 없다).
 * 문구 조회가 실패하면(=null) 치환하지 않고 기존 경로를 그대로 탄다 — 빈 헤드라인을 만들지 않는다.
 */
function buildHeadlineLines(
  input: DiagnosisInputLike,
  _areaScores: AreaScores,
  page1Level: string,
  type: string | null,
  sincerityFlagged: boolean,
) {
  if (sincerityFlagged) {
    const head = commonCopy("SINCERITY_HEAD");
    // \n = 확정된 라인 분리 지점(diagnosisCopy SINCERITY_HEAD 주석 참고). 분리 지점이 없는
    // 문자열(예: DB 오버라이드 구본)은 그대로 한 줄로 나간다.
    if (head) return head.split("\n").filter((line) => line.trim() !== "");
  }

  const head = type ? TYPE_COPY[type]?.head : null;
  const name = input.profile?.name ?? null;

  if (head && name)
    return [fill(templateCopy("headline"), { name, head }, "headline")];
  if (head) return [head];
  return [levelCopy(1, page1Level)].filter((line) => line != null);
}

/**
 * 학습 6축(§7.2 learningAxes). 배열 순서는 PAGE1_AREAS 고정 = 레이더 축 순서다.
 * PriorityTable 은 ReportPageOne 이 이 배열을 오름차순 정렬해 받으므로, badge 는 정렬 결과와
 * 반드시 일치해야 한다 — 그래서 뱃지는 직접 세지 않고 priorityBadges() 결과를 인덱싱한다.
 */
function buildLearningAxes(areaScores: AreaScores) {
  const badgeByCode = new Map(
    priorityBadges(areaScores).map((row) => [row.code, row.badge]),
  );

  return PAGE1_AREAS.map((code) => {
    const score = areaScores[code] ?? 0;
    const badge = badgeByCode.get(code);
    const need = areaCopy(code)?.need;
    const state = stateOf(score);
    return {
      name: AREA_LABEL[code],
      score,
      badge,
      status: STATE_LABEL.page1[state],
      tone: toneOf(score),
      // W2 확정(2026-08-11) — 뱃지는 배점표대로 상대 순위 유지, '필요한 것' 조언만 절대 임계
      // (70점 이상 = TOP)로 분기한다. 순위와 조언 축을 분리한다(문구집 03_진단서술 어휘 규율).
      need:
        (state === "TOP" ? need?.keep : need?.improve) ??
        COPY_FALLBACK.VALUE_MISSING,
    };
  });
}

/** 요약 카드 3장(§7.2). label 이 React key 라 3개가 유일해야 한다(문구집 title 3종이 서로 다르다). */
function buildSummaryCards(
  page1Overall: number,
  page2Overall: number,
  gap: { reached: boolean; gap: number; lowestName: string },
) {
  return [
    {
      label: templateCopy("card_exec.title"),
      value: `${page1Overall}점`,
      sub: fill(
        templateCopy("card_exec.sub"),
        { target: TARGET_SCORE },
        "card_exec.sub",
      ),
    },
    {
      label: templateCopy("card_school.title"),
      value: `${page2Overall}점`,
      sub: fill(
        templateCopy("card_school.sub"),
        { grade: LEVEL_LABEL[levelOf(page2Overall)] },
        "card_school.sub",
      ),
    },
    {
      // Q-29 확정(2026-08-11) — gap <= 0(모든 영역이 목표 점수 도달)이면 제목·부제를
      // card_goal_met 전용 키로 함께 교체한다. '가장 시급한 영역'이라 써 놓고 바로 아래에서
      // '도달했다'고 말하는 자기모순을 막는다.
      label: gap.reached
        ? templateCopy("card_goal_met.title")
        : templateCopy("card_urgent.title"),
      value: gap.lowestName,
      sub: gap.reached
        ? templateCopy("card_goal_met.sub")
        : fill(
            templateCopy("card_urgent.sub"),
            { gap: gap.gap },
            "card_urgent.sub",
          ),
    },
  ];
}

/**
 * 주요 학습 특성 3블록(§7.2 traits) — PAGE1 점수 오름차순 하위 3영역.
 * 조회 키는 화면 라벨이 아니라 상태 코드다(§5.1 매핑표 — narrativeCopy 가 코드만 받는다).
 * 문구가 없는 조합은 빈 카드를 만들지 않고 제외한다(창작 금지).
 */
function buildTraits(areaScores: AreaScores) {
  return sortByScoreAsc(PAGE1_AREAS, areaScores)
    .slice(0, TRAIT_COUNT)
    .map((code) => narrativeCopy(code, stateOf(areaScores[code] ?? 0)))
    .filter((copy) => copy != null)
    .map((copy) => ({ title: copy.title, body: copy.body }));
}

/* ================================================================== *
 * 3. 페이지 2 섹션
 * ================================================================== */

/**
 * 2페이지 요약 줄(§5.2 page2_summary 결측·경계 분기).
 * 최고·최저가 같거나 최고점 자체가 저득점이면 "{high} 영역은 안정적으로 관리되고 있으나"가 사실과
 * 어긋난다 → 종합 등급 문구 단독으로 대체한다. 저득점 판정은 stateOf 에서 파생시켜 Q-32 확정 시
 * 임계가 한 곳만 움직이게 한다(별도 상수를 두면 경계가 두 벌이 된다).
 */
function buildReadinessSummary(areaScores: AreaScores, page2Overall: number) {
  const sorted = sortByScoreAsc(PAGE2_AREAS, areaScores);
  const lowCode = sorted[0];
  const highCode = sorted[sorted.length - 1];
  const lowScore = areaScores[lowCode] ?? 0;
  const highScore = areaScores[highCode] ?? 0;
  const highState = stateOf(highScore);
  const fallback = [levelCopy(2, levelOf(page2Overall))].filter(
    (line) => line != null,
  );

  // 동점 판정은 **점수**로 한다. 코드 동일성(highCode === lowCode)은 원소가 6개라 절대 성립하지
  // 않는 죽은 분기였고, 그 탓에 6영역이 모두 같은 점수인 응답에서 두 영역을 우열로 서술했다.
  if (highScore === lowScore || (highState !== "TOP" && highState !== "MID"))
    return fallback;

  const line = fill(
    templateCopy("page2_summary"),
    { high: AREA_LABEL[highCode], low: AREA_LABEL[lowCode] },
    "page2_summary",
  );
  return line ? [line] : fallback;
}

/** 6영역 바 그래프(§7.2 readiness.areas) — **정렬 주체가 엔진**이다(PAGE1 과 달리 컴포넌트가 정렬하지 않는다). */
function buildReadinessAreas(areaScores: AreaScores) {
  return sortByScoreAsc(PAGE2_AREAS, areaScores).map((code) => {
    const score = areaScores[code] ?? 0;
    return {
      name: AREA_LABEL[code],
      score,
      tone: toneOf(score),
      status: STATE_LABEL.page2[stateOf(score)],
    };
  });
}

/**
 * 강점 리스트(§5.1 강점 개수 분기 B-04).
 * 0개·1개 분기가 문구집에 있는데 InsightColumns 에는 캡션 슬롯이 없다 → 리스트 첫 항목으로 흡수한다
 * (컴포넌트를 고치지 않고 문구도 창작하지 않는 유일한 경로).
 */
function buildStrengths(areaScores: AreaScores) {
  const items = [...STRENGTH_SCOPE]
    .sort(
      (a, b) =>
        (areaScores[b] ?? 0) - (areaScores[a] ?? 0) ||
        STRENGTH_SCOPE.indexOf(a) - STRENGTH_SCOPE.indexOf(b),
    )
    .filter((code) => (areaScores[code] ?? 0) >= STRENGTH_THRESHOLD)
    .slice(0, STRENGTH_MAX)
    .map((code) => areaCopy(code)?.strength)
    .filter((text) => typeof text === "string");

  if (items.length === 0)
    return [commonCopy("STR_NONE")].filter((text) => text != null);
  if (items.length === 1)
    return [commonCopy("STR_ONE"), items[0]].filter((text) => text != null);
  return items;
}

/** 보완 리스트(§5.1) — 하위 영역의 weakness. 개수·대상은 F-07 확정(위 주석) — 12영역 하위 4개 고정. */
function buildImprovements(areaScores: AreaScores) {
  return sortByScoreAsc(IMPROVEMENT_SCOPE, areaScores)
    .slice(0, IMPROVEMENT_MAX)
    .map((code) => areaCopy(code)?.weakness)
    .filter((text) => typeof text === "string");
}

/**
 * 입결 비교 섹션(§4.6 · §7.2 B-13).
 *
 * AdmissionSection 은 5키를 무조건 구조분해하고 rows.map 을 돈다 — 입결 마스터가 연결되지 않은
 * 현재(ctx.cuts 부재)에도 admission 객체와 rows: [] 는 반드시 존재해야 한다.
 * 행 라벨·'0.91등급 부족' 문자열화는 여기 몫이다(엔진은 key/value/diff 구조만 낸다).
 */
function buildAdmission(input: DiagnosisInputLike, ctx: BuildReportCtx) {
  // F-22 — '조회 실패'(일시 오류)와 '자료 없음'(영구 부재)은 다른 사실이다. 훅이 참조 비교로
  // 가른 결과가 ctx.cutsError 로 올라온다. 여기서는 불리언 하나만 본다.
  const fetchFailed = ctx.cutsError === true;
  // normalizedCuts/admissionRows(diagnosisScoring.js)가 cuts?.cut50 형태로만 읽으므로
  // null과 {} 는 런타임에서 완전히 동치다 — 타입만 successProbability의 JSDoc 셰이프에 맞춘다.
  const cuts = ctx.cuts ?? null;
  const mine = convertToNineScale(
    input.gradeSystem,
    input.scores?.naesinOverall,
  );
  const band = admissionBand(mine, cuts);
  // F-01 — mine/cuts 를 함께 넘겨야 열린 구간 보정(EDGE)이 산다. 생략하면 '컷보다 1등급 여유'와
  // '컷 언저리'가 같은 확률을 받는다.
  const probability = successProbability(input, band, mine, cuts);
  const probabilityRange = toProbabilityRange(probability);

  // TODO(Q-04): 확률 비노출이 확정되면 라벨은 '합격 가능성'이 된다. 지금은 문구집 원문에서 접두를
  // 잘라 쓴다 — 문자열을 새로 쓰지 않으면서 '{prob}%' 슬롯만 밴드 4글자로 대체하는 경로다.
  // 접두가 비면(문구집이 '{prob}% 합격 가능성' 류로 바뀌면) 라벨이 화면에서 조용히 사라진다.
  const headlineTpl = templateCopy("admission_headline") ?? "";
  const probabilityLabel =
    // split은 구분자 유무와 무관하게 항상 1개 이상의 원소를 반환하므로 [0]은 항상 존재.
    headlineTpl.split("{prob}")[0]!.trim() || REPORT_FALLBACK.PROBABILITY_LABEL;

  const query = input.admissionQuery;
  const year = ctx.admissionMeta?.year ?? null;
  // F-19 — 전형 유형은 표시 경로에서만 확장형으로 바꾼다(조회 키는 건드리지 않는다).
  const typeDisplay =
    query?.admissionType != null
      ? (SELF_DECIDED.ADMISSION_TYPE_DISPLAY[query.admissionType] ??
        query.admissionType)
      : null;
  // 토큰이 하나라도 비면 '{university} {major}' 원문이 그대로 노출된다 → 상시 노출 대상인
  // ADMISSION_NOTE 로 대체한다(§2.3 이 요구하는 안내가 이 단일 캡션 슬롯을 함께 쓴다).
  const caption =
    query && year
      ? fill(
          templateCopy("admission_source"),
          {
            university: query.university,
            major: query.department,
            type: typeDisplay,
            year,
          },
          "admission_source",
        )
      : commonCopy("ADMISSION_NOTE");

  // F-09 — cuts.finalAvg 는 영구 null 이라 'avg' 행은 절대 나오지 않는다. 실제로 렌더되는 행은
  // 최대 3행(cut50 / cut70 / mine)이다. grade_avg 계열로 대체 매핑하지 마라(모집단이 다르다).
  // G-1c — 'mine' 행이 9등급 환산값일 때만 접미어를 붙인다(NINE 은 원값=환산값이라 표기 불필요).
  const mineIsConverted =
    input.gradeSystem != null && input.gradeSystem !== "NINE";
  const rows = admissionRows(mine, cuts).map((row) => ({
    label:
      row.key === "mine" && mineIsConverted
        ? `${templateCopy("cut_labels.mine")}${SELF_DECIDED.ADMISSION_MINE_CONVERTED_SUFFIX}`
        : templateCopy(`cut_labels.${row.key}`),
    grade: `${row.value.toFixed(2)}등급`,
    gap: formatAdmissionDiff(row),
    emphasis: row.emphasis,
  }));

  const admissionNote = commonCopy("ADMISSION_NOTE");

  // PROB_DISPLAY_MODE(diagnosisScoringTable.ts)는 상수 리터럴 초기값 그대로 export 돼
  // TS가 "SCREEN_EXTRA" 단일 리터럴 타입으로 좁힌다 — 이 상수는 값을 직접 고쳐 뒤집는
  // 롤백 레버라 원본 셰이프(문자열)를 바꾸지 않고 여기서만 비교용으로 넓힌다.
  const probDisplayMode: string = PROB_DISPLAY_MODE;

  // G-3(NIT 1, 2026-08-12) — PROB_DISPLAY_MODE 를 'HEADLINE_SLOT' 으로 되돌리면 구간 라벨이
  // probabilityValue(헤드라인)에 실린다. buildAdmission 은 모드와 무관하게 화면 전용 슬롯도 항상
  // 채웠었는데, 그러면 같은 구간 문자열이 헤드라인 + fd-screen-only 문단에 **두 번** 뜬다
  // (결정문이 약속한 "상수 한 줄 롤백"이 성립하지 않는 원인). HEADLINE_SLOT 모드에서는 화면
  // 전용 슬롯 3종(range/rangeLabel/probNote)만 null 로 죽인다 — badge('참고 결과')는 헤드라인
  // 옆에 계속 붙어야 하므로 모드와 무관하게 유지한다.
  const screenProbabilityRange =
    probDisplayMode === "HEADLINE_SLOT" ? null : probabilityRange;

  return {
    /* ── AdmissionSection 이 무조건 구조분해하는 5키(§7.4.3 불변식) ── */
    probabilityLabel,
    // F-01 — PROB_DISPLAY_MODE 가 'SCREEN_EXTRA' 인 동안 인쇄 슬롯은 **밴드 4글자**를 유지한다.
    // 점추정 %(엔진이 내는 정수)는 학생 화면 어디에도 그대로 나가지 않는다 — 진로 판단에 쓰이는
    // 값에 소수·정수 정밀도를 부여하지 않는다는 결정이다. 'HEADLINE_SLOT' 으로 뒤집으면 이 자리에
    // 구간 라벨이 들어가 인쇄에도 실린다(상수 한 줄로 되돌린다).
    probabilityValue:
      probDisplayMode === "HEADLINE_SLOT" && probabilityRange != null
        ? probabilityRange
        : ((band ? ADMISSION_BAND_LABEL[band] : undefined) ??
          REPORT_FALLBACK.BAND_VALUE_NODATA),
    // 조회 실패에 BAND_NODATA('…자료가 없어 산출하지 않았습니다')를 쓰는 것은 학생에게 거짓을
    // 말하는 것이다 — 그 문장은 영구 부재를 **단정**한다. 실패 전용 문구로 가른다(인쇄에도 나간다).
    summary: fetchFailed
      ? (commonCopy("ADMISSION_FETCH_FAIL") ?? commonCopy("BAND_NODATA"))
      : ((band ? ADMISSION_BAND_COPY[band]?.text : commonCopy("BAND_NODATA")) ??
        commonCopy("BAND_NODATA")),
    caption,
    rows,

    /* ── 화면 전용 확장 슬롯(인쇄 제외). 값이 없으면 null → 컴포넌트가 통째로 뺀다 ── */
    // 표가 0행이면 헤더만 남은 빈 박스가 '로딩되다 만 표'로 읽힌다(F-10) → 컴포넌트가 박스 자체를
    // 숨길 수 있게 판정 결과를 내려준다. 엔진은 계속 rows: [] 를 낸다(계약 유지).
    // G-1b(2026-08-12) — `rows.length > 0` 은 발화하지 않았다. admissionRows 가 컷이 없어도
    // 'mine'(emphasis) 행은 항상 내므로 컷 미보유 조합에서도 rows.length 는 1이었다. 판정을
    // '행이 있는가'가 아니라 '비교 대상(컷)이 있는가'로 바꾼다 — mine 만 있는 표는 비교표가 아니다.
    hasRows: rows.some((row) => !row.emphasis),
    // G-3(NIT 2) — ADMISSION_EMPTY_TABLE_MODE 롤백 레버(SCREEN_EXTRAS.rules)의 'NOTICE_ROW' 값이
    // 쓸 문구다. 컴포넌트가 어느 모드인지는 여기서 모른다(화면 레이아웃 결정은 이 계층 소관이
    // 아니다 — diagnosisScreenCopy.js 헤더 주석 참조) — 그래서 모드와 무관하게 항상 값만
    // 계산해 내려주고, "쓸지 말지"는 AdmissionSection 이 SCREEN_EXTRAS.rules 를 직접 읽어 정한다.
    // 새 문구가 아니라 REPORT_FALLBACK.BAND_VALUE_NODATA('자료 없음') 재사용이다.
    emptyNotice: rows.some((row) => !row.emphasis)
      ? null
      : REPORT_FALLBACK.BAND_VALUE_NODATA,
    fetchFailed,
    // 어드민·저장 페이로드용 원값. 화면에 그대로 쓰지 마라 — 노출은 probabilityRange 로만 한다.
    probability,
    // G-3(NIT 1) — 화면 전용 슬롯은 screenProbabilityRange 를 쓴다(위 주석). HEADLINE_SLOT 모드가
    // 아닌 한(=현재) screenProbabilityRange === probabilityRange 라 동작은 그대로다.
    probabilityRange: screenProbabilityRange,
    probabilityRangeLabel:
      screenProbabilityRange != null ? SELF_DECIDED.PROB_RANGE_HEADING : null,
    // '참고 결과' 배지는 확률이 있을 때만 붙인다(자료 없음 상태에 붙일 이유가 없다). 헤드라인
    // 옆 인라인 배지라 모드와 무관하게 원래 probabilityRange(=확률 유무)를 기준으로 삼는다.
    probabilityBadge:
      probabilityRange != null ? SELF_DECIDED.PROB_REFERENCE_BADGE : null,
    // F-05 probNote — buildNotices 가 조립만 하고 슬롯이 없어 죽어 있던 키가 여기서 살아난다.
    // G-2(WARN 4, 2026-08-12 판단) — 밴드(성적-컷 거리만 반영)와 확률 구간(+ 14~16번 수능최저·
    // 학생부연계·면접 가감, −30~+15%p)은 근거가 서로 달라 같은 화면에서 '안정'인데 '40~50%'처럼
    // 밴드 간격(20%p)보다 넓게 벌어질 수 있다. 새 캡션을 만들지 않는다 — PROB_NOTE 원문이 이미
    // "실제 합격 결과는 … 수능최저 충족 여부 등에 따라 달라질 수 있습니다"로 확률이 성적 위치
    // 외 요인까지 반영한다는 사실을 밝히고 있고, 구간 라벨 바로 아래(fd-screen-only)에 인접
    // 배치돼 있다(AdmissionSection.jsx). 가감 폭을 인위로 줄이는 것(clamp)은 14~16번 원문 규칙을
    // 화면 표시 단계에서 조용히 무력화하는 것이라 채택하지 않았다.
    probNote: screenProbabilityRange != null ? commonCopy("PROB_NOTE") : null,
    // 캡션이 이미 같은 원문을 쓰고 있으면(q15 미완주 폴백) 같은 문장이 두 번 나온다 → 중복 가드.
    tableNote:
      admissionNote != null && admissionNote !== caption ? admissionNote : null,
    // 표가 그려질 때만 '왜 최종등록자 평균 행이 없는지'를 밝힌다(F-09). hasRows 와 같은 조건으로
    // 게이트한다(G-1b) — mine 행뿐인 상태에서 "평균 행만 빠졌다"는 인상을 주지 않기 위해서다.
    finalAvgNote: rows.some((row) => !row.emphasis)
      ? SELF_DECIDED.ADMISSION_FINAL_AVG_OMITTED
      : null,
  };
}

/** diff > 0 이면 내 등급 숫자가 더 커서 '부족', 음수면 '우위'. 내 성적 행과 동률은 '기준점'이다. */
function formatAdmissionDiff(row: {
  key: string;
  value: number;
  diff: number | null;
  emphasis: boolean;
}) {
  if (row.key === "mine" || row.diff == null || row.diff === 0)
    return templateCopy("diff_base");
  const key = row.diff > 0 ? "diff_short" : "diff_over";
  return fill(templateCopy(key), { v: Math.abs(row.diff).toFixed(2) }, key);
}

/**
 * 추천 서비스 카드(§4.5 · §7.2).
 * 전 서비스 fit < 50 이면 SVC_NONE 을 노출할 캡션 슬롯이 없어 안내 카드 1장으로 흡수한다
 * (rank·name 을 비워 카드 제목 줄만 접는다 — 컴포넌트 수정도 문구 창작도 하지 않는다).
 */
type RankedService = {
  code: string;
  name: string;
  fit: number;
  // rankServices(diagnosisScoring.js)의 실제 추론 타입은 리터럴 유니온으로 좁혀지지 않고
  // string으로 넓혀진다(그 파일은 변환 대상 밖) — 그대로 맞춘다.
  tier: string | null;
  lowestLinkedAreaName: string | null;
};

function buildRecommendations(services: {
  rank1: RankedService | null;
  rank2: RankedService | null;
}) {
  const { rank1, rank2 } = services;
  const picked = [rank1, rank2].filter((service) => service != null);

  if (picked.length === 0) {
    return [
      { rank: "", name: "", desc: commonCopy("SVC_NONE") ?? "", chips: [] },
    ];
  }

  return picked.map((service, index) => {
    const copy = serviceCopy(
      service.code,
      service.tier as "HIGH" | "MID" | "LOW" | null,
    );
    return {
      rank: RANK_LABELS[index],
      name: SERVICE_LABEL[service.code] ?? service.name ?? "",
      desc: copy?.text ?? rankPrefix(index, service),
      chips: copy?.tags ?? [],
    };
  });
}

/**
 * 서비스 카드 본문 폴백. SERVICE_COPY 키가 SERVICE_CODES 와 어긋나면 copy 가 null 이 되어 본문이
 * 통째로 빈다(실제로 PERFORM_SUPPORT ↔ PERFORM_CARE 로 어긋나 있었다) → 순위 캡션으로 대체한다.
 *
 * SVC_RANK2_PREFIX 는 COMMON_COPY 중 유일하게 토큰({영역})을 갖는다. 그대로 렌더하면 화면에
 * '{영역}' 리터럴이 노출되므로 반드시 fill 을 한 번 더 태운다(§5.2 가 명시적으로 경고한 경로다).
 * 치환값은 rankServices 가 이미 산출한 lowestLinkedAreaName 이다.
 */
function rankPrefix(index: number, service: RankedService) {
  const generic = commonCopy("SVC_RANK1_PREFIX") ?? "";
  // 치환값이 없으면 토큰이 남으므로 아예 토큰 없는 1순위 캡션으로 떨어뜨린다.
  if (index === 0 || service.lowestLinkedAreaName == null) return generic;
  return fill(
    commonCopy("SVC_RANK2_PREFIX") ?? "",
    { 영역: service.lowestLinkedAreaName },
    "SVC_RANK2_PREFIX",
  );
}

/**
 * 긴급도 블록(§4.4 E · §5.1 "긴급도 문구 = URGENCY_COPY[urgencyLevel]").
 *
 * 승인된 A4 2장 시트에는 이 문장을 놓을 슬롯이 없다(요약 카드 ③은 targetGap 이지 urgencyOf 가
 * 아니다) — 인쇄 슬롯은 여전히 없다. (해소됨 · F-04/F-05 확정, 2026-08-12) 화면 전용 확장
 * 영역(SCREEN_EXTRAS, ReportScreenExtras.jsx)이 level·lowAreaCount 를 urgencyLine 템플릿으로
 * 소비한다 — 더 이상 죽은 코드가 아니다. score 는 여전히 화면에 내지 않는다(F-05 참조).
 */
function buildUrgency(input: DiagnosisInputLike, areaScores: AreaScores) {
  const urgency = urgencyOf(input, areaScores);
  return {
    level: urgency.level,
    // F-05 — 라벨은 배점표 141행 원문('0~19 낮음 / 20~34 보통 / 35~49 높음 / 50 이상 매우 높음')이라
    // 창작이 아니다. 화면에는 이 라벨과 lowAreaCount 만 쓰고 **score 는 쓰지 않는다** — 일정 점수
    // (0~30) + 저득점 영역수×10 의 내부 합성값이라 상한이 화면 어디에도 없고, 옆의 영역 점수
    // (0~100)와 같은 척도로 읽혀 '긴급도 50점'이 절반으로 오해된다.
    levelLabel: URGENCY_LEVEL_LABEL[urgency.level] ?? null,
    // 저장·어드민 조회 전용. 화면 미표시는 결정이지 누락이 아니다 — 다시 넣지 마라.
    score: urgency.score,
    lowAreaCount: urgency.lowAreaCount,
    // '{threshold}점 미만 영역 N개' 문장을 UI 가 조립할 때 쓰는 임계. 리터럴 40 을 UI 에 심으면
    // 값이 두 벌이 된다.
    areaThreshold: URGENCY_AREA_THRESHOLD,
    message: URGENCY_COPY[urgency.level] ?? null,
  };
}

/**
 * 영역별 상세 진단 12행(F-04 · AREA_COPY.levels 60문구 중 12개가 매 진단마다 선택된다).
 *
 * 지금까지 이 60문구는 어느 슬롯에도 바인딩되지 않아 통째로 죽어 있었다. 화면 전용 확장 영역에
 * 12행 표로 싣는다 — 인쇄(A4 2장)에는 나가지 않으므로 세로 예산을 소비하지 않는다.
 *
 * 정렬은 sortByScoreAsc 그대로다. PriorityTable(1p)·buildReadinessAreas(2p)와 같은 규칙이라
 * 학생이 방금 본 순서를 그대로 재현한다 — 여기서만 다른 정렬을 쓰면 같은 6영역이 두 순서로 보인다.
 * 조회 키는 levelOf(점수)로, PAGE_GRADE_COPY 와 같은 5단 등급 축이다(stateOf 4단과 혼동 금지).
 *
 * detail 이 null 인 행(문구 미커버)은 제거하지 않고 그대로 내려보낸다 — 6행 고정 shape 를 유지해
 * UI 가 인덱스로 접근해도 깨지지 않게 하고, 렌더는 컴포넌트가 null 을 걸러 생략한다(창작 금지).
 */
function buildAreaDetails(areaScores: AreaScores) {
  const rowsOf = (areas, pageKey) =>
    sortByScoreAsc(areas, areaScores).map((code) => {
      const score = areaScores[code] ?? 0;
      const level = levelOf(score);
      return {
        code,
        name: AREA_LABEL[code],
        score,
        level,
        levelLabel: LEVEL_LABEL[level] ?? null,
        // 페이지별 상태 어휘가 다르다(1p '취약' ↔ 2p '우선 보완') — 블록이 속한 페이지 축을 따른다.
        status: STATE_LABEL[pageKey][stateOf(score)],
        tone: toneOf(score),
        detail: areaCopy(code)?.levels?.[level] ?? null,
      };
    });

  return {
    page1: rowsOf(PAGE1_AREAS, "page1"),
    page2: rowsOf(PAGE2_AREAS, "page2"),
  };
}

/**
 * 영역별 맞춤 전략 12묶음 × 4항목(F-04 · AREA_COPY.strategies 48문구).
 *
 * 12영역 점수 오름차순이다 — UI 가 앞에서 N개만 펼치고 나머지를 접을 수 있게, 순서 자체에
 * '급한 것부터'라는 의미를 싣는다. 몇 개를 펼칠지는 화면 결정이라 여기서 자르지 않는다.
 * PriorityTable 의 '필요한 것'(need.improve/keep)과는 다른 문구 묶음이다 — 문구집 02 시트에서
 * '필요한 것'과 '맞춤 전략'이 서로 다른 구분이고 문자열도 겹치지 않는다(중복 노출 아님).
 */
function buildStrategyGroups(areaScores: AreaScores) {
  return sortByScoreAsc(AREA_CODES, areaScores)
    .map((code) => ({
      code,
      name: AREA_LABEL[code],
      score: areaScores[code] ?? 0,
      items: areaCopy(code)?.strategies ?? [],
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * 고정 안내 문구(§5.1 "조건 없음, 항상") + 조건부 안내.
 *
 * 컴포넌트에 슬롯이 없는 것은 긴급도와 같은 사정이지만, §2.3 이 ADMISSION_NOTE 를 상시 노출로
 * 못박았고 REPORT_BASIS·REPORT_LIMIT 도 리포트 신뢰성 고지라 누락과 보류를 구분해 둘 필요가 있다.
 * 값이 없는(=조건 미충족) 항목은 키를 두되 null 로 남긴다.
 *
 * F-15 확정(2026-08-11) — SINCERITY_* 4종의 판정 규칙이 엔진(sincerityOf)에 생겨 조립한다.
 *   이 함수는 임계값을 알지 않고 flagged 불리언 하나만 본다 — 오탐이 보고되면 되돌릴 곳이
 *   엔진 상수 한 곳이어야 한다.
 * F-06 확정(2026-08-11) — 서비스 제한 안내는 학년 리터럴이 아니라 엔진의 filterReason 으로
 *   분기한다. 판정 규칙(고3 6월 경계·KST)이 두 벌이 되지 않게 하려는 것이다.
 */
function buildNotices(
  input: DiagnosisInputLike,
  serviceFilterReason: string | null,
  sincerityFlagged: boolean,
) {
  const likert = { ...(input.likert1 ?? {}), ...(input.likert2 ?? {}) };
  const likertKeys = Object.keys(likert);
  const hasSkipped =
    likertKeys.length > 0 && likertKeys.some((key) => likert[key] == null);

  return {
    // 불성실 판정이면 '이번 진단에서 확인된 특성 세 가지입니다' 대신 "점수만을 기준으로 정리했다"는
    // 문장으로 **치환**한다(유형 판정만 보류하고 점수는 그대로 낸다는 F-15 원칙).
    traitIntro:
      (sincerityFlagged ? commonCopy("SINCERITY_TRAIT") : null) ??
      commonCopy("TRAIT_INTRO"),
    hexCaption: commonCopy("HEX_CAPTION"),
    goalCompare: commonCopy("GOAL_COMPARE"),
    reportBasis: commonCopy("REPORT_BASIS"),
    reportLimit: commonCopy("REPORT_LIMIT"),
    // ⚠️ probNote·admissionNote 는 admission 블록에도 **조건부로** 실린다(admission.probNote /
    // admission.tableNote). 렌더는 admission 쪽 키로만 하라 — 여기 것까지 함께 그리면 같은
    // 문단이 한 화면에 두 번 나온다. 이 두 키는 "문구가 조립은 됐다"를 보증하는 상시 슬롯이다.
    probNote: commonCopy("PROB_NOTE"),
    admissionNote: commonCopy("ADMISSION_NOTE"),
    // 배점표 1번이 후보를 2종으로 제한하는 경우에만 붙는 안내. 중3·N수생은 학년 자체가 근거이고
    // (SERVICE_GRADE_FILTER), 고3 6~12월은 제출 시각이 근거다(serviceCandidates).
    // 문구가 갈리는 이유도 다르다 — M3 는 문구집 원문, H3_LATE 는 자체 결정(2026-08-12 확정)이다.
    serviceLimit:
      serviceFilterReason === "M3"
        ? commonCopy("SVC_M3_LIMIT")
        : serviceFilterReason === "H3_LATE"
          ? SELF_DECIDED.SERVICE_H3_LATE_NOTICE
          : null,
    // 리커트를 건너뛴 문장이 있으면 해당 영역이 남은 응답만으로 산출됐음을 알린다(§4.2 결측).
    skipNote: hasSkipped ? commonCopy("SKIP_NOTE") : null,
    // F-15 — 아래 2종은 불성실 판정에서만 발화하는 화면 전용 문구다. 배너는 리포트 최상단(시트
    // 밖)에 두어야 기능한다 — 2장을 다 읽은 뒤에 나오는 '결과가 다를 수 있다'는 경고는 무의미하다.
    sincerityBanner: sincerityFlagged ? commonCopy("SINCERITY_BANNER") : null,
    sincerityAct: sincerityFlagged ? commonCopy("SINCERITY_ACT") : null,
  };
}

/* ================================================================== *
 * 4. 조립
 * ================================================================== */

/**
 * DiagnosisInput → ReportData (§7.1 · §7.2 · §7.4.3).
 *
 * @param {object} input normalizeAnswers() 결과
 * @param {{ cuts?: { cut50: number|null, cut70: number|null, finalAvg: number|null } | null,
 *           cutsError?: boolean,
 *           admissionMeta?: { year: string|number|null } }} [ctx] 입결 마스터 조회 결과.
 *          미연결이면 입결 섹션은 BAND_NODATA 로 조립된다(섹션 자체를 없애지 않는다 — 컴포넌트 계약).
 *          cutsError 는 F-22 — '자료가 없다'(cuts null)와 '못 불러왔다'를 가르는 유일한 신호다.
 *          **ADMISSION_FETCH_ERROR 센티널을 cuts 에 그대로 넣지 마라** — JSON 직렬화를 거치면
 *          참조 동일성이 사라져 훅 밖에서는 판별할 수 없다. 훅이 불리언으로 바꿔 올린다.
 * @returns {object} renewalReportSample 과 동일 shape + traitsHeading + 화면 전용 확장 키
 */
// input: 저장 페이로드(diagnosisInputStorage) 또는 normalizeAnswers() 결과가 그대로
// 들어온다 — 둘 다 이 배치 범위 밖(하드 버킷·타 파일 소유)이라 정확한 셰이프를 강제하지
// 않는다(원 JSDoc @param {object} input과 동일한 관용도). 내부에서는 DiagnosisInputLike로 좁힌다.
export function buildReport(input: any, ctx: BuildReportCtx = {}) {
  const safeInput: DiagnosisInputLike =
    input && typeof input === "object" ? input : {};
  const areaScores = scoreAreas(safeInput);
  const page1Overall = overallScore(areaScores, 1);
  const page2Overall = overallScore(areaScores, 2);
  const gap = targetGap(areaScores);
  const name = safeInput.profile?.name ?? null;

  // 아래 3개는 두 곳 이상에서 쓰이므로 한 번만 계산한다 — 같은 판정을 두 번 돌리면 규칙이
  // 갈라졌을 때 헤드라인과 배너가 서로 다른 말을 한다.
  const sincerity = sincerityOf(safeInput);
  const studentType = classifyStudentType(safeInput, areaScores);
  const services = rankServices(safeInput, areaScores);

  return {
    // F-18 — 픽스처 폴백(가상 학생)인지 실제 응답인지 UI 가 구분하는 유일한 플래그.
    // buildReport 를 통과한 데이터는 정의상 실제 응답이므로 항상 false 다.
    // 픽스처 경로(FreeDiagnosisReport.adaptSample)만 true 로 덮어써 예시 배너·워터마크를 켠다 —
    // 실제 리포트에 예시 표시가 붙을 경로가 구조적으로 존재하지 않게 하려는 배치다.
    isSample: false,

    student: {
      name,
      // StudentInfoBlock 의 이름 행. 이름 미수집(Q-01) 상태에서 컴포넌트가 `${name} 학생` 을 조립하면
      // '학생'만 남으므로 조립을 여기로 올렸다 — 빈 문자열이어도 행 높이(h-6)가 고정이라 레이아웃은 그대로다.
      nameLine: name ? `${name} 학생` : "",
      grade: orMissing(optionLabelOf("q1", safeInput.profile?.gradeLevel)),
      schoolType: orMissing(optionLabelOf("q2", safeInput.profile?.schoolType)),
      desiredMajor: orMissing(safeInput.goal?.targetMajor),
      // 표지(ReportCoverPage) 전용 원본값 — "미입력"(orMissing) 표시용 폴백을 거치지
      // 않은 순수 데이터. StudentInfoBlock의 desiredMajor/diagnosedAt은 항상 행을
      // 렌더하는 표(빈 값도 "미입력"으로 채워야 레이아웃이 유지된다)라 그대로 두고,
      // 표지는 값이 없으면 그 줄 자체를 지워야 해서(no-fallback-constants) 별도로
      // null 그대로 내려보낸다.
      desiredMajorRaw: safeInput.goal?.targetMajor ?? null,
      gpa: formatGpa(safeInput.gradeSystem, safeInput.scores?.naesinOverall),
      // F-14 확정(2026-08-11) — 축약 라벨을 쓴다. 원문 라벨은 w-50 안에서 2줄로 접힌다.
      gradeTrend: orMissing(formatGradeTrend(safeInput.gradeTrend)),
      diagnosedAt: orMissing(formatDiagnosedAt(safeInput.meta?.diagnosedAt)),
      diagnosedAtRaw: formatDiagnosedAt(safeInput.meta?.diagnosedAt),
    },

    // §5.2 name 결측 폴백 — '{name} 학생의 주요 학습 특성'에서 접두를 제거한 축약형.
    // ReportPageOne 이 컴포넌트 안에서 조립하던 문자열을 여기로 올렸다(이름이 null 이면 '학생'만 남는다).
    traitsHeading: name
      ? fill(templateCopy("section_traits"), { name }, "section_traits")
      : REPORT_FALLBACK.TRAITS_HEADING_ANON,

    headlineLines: buildHeadlineLines(
      safeInput,
      areaScores,
      levelOf(page1Overall),
      studentType,
      sincerity.flagged,
    ),
    learningAxes: buildLearningAxes(areaScores),
    summaryCards: buildSummaryCards(page1Overall, page2Overall, gap),
    traits: buildTraits(areaScores),

    // F-03 완성(2026-08-13) — 판정된 유형 코드(8종 중 하나) 또는 null.
    studentType,
    // TYPE_COPY.detail·todos 를 head 와 같은 방식으로 엔진에서 해석해 내린다(컴포넌트에 TYPE_COPY
    // 결합을 새어나가게 하지 않는다). 과거 미렌더 사유였던 '일부 유형에만 문구가 있어 비대칭'은
    // 8종 문구 전량 확정으로 해소됐다. 판정 불가(null)·직선응답이면 detail=null·todos=[] 이라
    // 예약 슬롯(1페이지 헤드라인 아래 detail · 확장 영역 '먼저 할 일' todos)이 자연히 접힌다.
    // 둘 다 화면 전용 슬롯이라 인쇄 A4 2장에는 영향이 없다.
    typeDetail: studentType ? (TYPE_COPY[studentType]?.detail ?? null) : null,
    typeTodos: studentType ? (TYPE_COPY[studentType]?.todos ?? []) : [],
    // F-15 — UI 계약은 flagged 불리언 하나다. 나머지 두 필드는 어드민·검산 진단용이며
    // 화면 분기에 쓰지 마라(임계값이 UI 로 새면 되돌릴 곳이 두 군데가 된다).
    sincerity,

    readiness: {
      scoreLabel: `${page2Overall}/100`,
      summaryLines: buildReadinessSummary(areaScores, page2Overall),
      areas: buildReadinessAreas(areaScores),
    },
    strengths: buildStrengths(areaScores),
    improvements: buildImprovements(areaScores),

    // F-04 — 화면 전용 확장 영역(인쇄 제외)이 쓰는 두 묶음. 종전에는 AREA_COPY 의 levels 60문구와
    // strategies 48문구가 어느 슬롯에도 바인딩되지 않아 통째로 죽어 있었다.
    areaDetails: buildAreaDetails(areaScores),
    strategyGroups: buildStrategyGroups(areaScores),

    admission: buildAdmission(safeInput, ctx ?? {}),
    recommendations: buildRecommendations(services),
    // F-06 가드레일 — 가입일 ≠ 진단일 오차로 잘못 걸린 학생(3월 가입·7월 진단)을 어드민·상담
    // 단계에서 재판정하려면 '왜 후보가 줄었는지'가 데이터에 남아야 한다. 이 필드 없이 배포하면
    // 오판정을 사후에 식별할 방법이 사라진다. 화면 분기용이 아니다.
    serviceFilterReason: services.filterReason ?? null,

    urgency: buildUrgency(safeInput, areaScores),
    notices: buildNotices(
      safeInput,
      services.filterReason ?? null,
      sincerity.flagged,
    ),

    // §4.5 원문 17번 감지 신호(Q-36 해소, 사용자 확정 2026-08-11) — urgency·notices와 달리
    // "슬롯이 아직 없다"가 아니라 **의도적으로 렌더하지 않는다**. 문구집 06_금지어의 진단·낙인
    // 경계에 걸리고, 오탐 상태에서 본인에게 되돌려주면 피해가 크다(조정자 판단). 저장 페이로드와
    // 어드민 조회 전용이다 — A4 두 페이지의 어떤 컴포넌트도 이 키를 읽으면 안 된다.
    signals: {
      emotional: detectEmotionalSignal(safeInput.freeText),
    },
  };
}

// 저장 키(DIAGNOSIS_INPUT_STORAGE_KEY)·직렬화·스키마 검증은 src/lib/diagnosisInputStorage.js 가
// 단독으로 소유한다. 여기 두면 설문 셸이 이 모듈을 import 하게 되어 제출 한 번을 위해 문구집과
// 리포트 조립 코드가 통째로 설문 번들에 끌려오고, 리터럴이 두 벌로 갈라질 자리도 생긴다.
