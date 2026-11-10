// 입결정보(/admission/results) 수시 입결 데이터의 순수 집계·포맷 로직 모음.
// React/DOM/Supabase 의존 없이 동작해야 하며, 브라우저와 node(스크립트) 양쪽에서
// import 가능해야 한다. (src/lib/admissionParsing.js 관례 동일)
//
// admission_results는 수시 전용 테이블이다(recruitment_period 축 폐지). 상세 화면은
// Q3(admission_results 원본 행) 한 번으로 필요한 행을 이미 손에 쥐고 있고, 가중평균
// 기준(모집인원 가중)이 아직 제품 미확정이라 산식이 바뀔 때마다 DB 마이그레이션을
// 돌리고 싶지 않다. 그래서 산식을 DB 뷰가 아니라 클라이언트 순수 함수로 둔다.
//
// 신규 5지표(grade_avg / grade_min / grade_avg10 / grade_min10 / grade_first_avg)는
// v1 미노출이다. 행에 실려 오더라도 여기서 화면용 파생값을 만들지 않는다(Q5).

import { site } from "@/config/site";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

// 표 연도 열. AdmissionGuidelines.jsx:79-83의 ACTIVE_ADMISSION_YEAR 상수 고정 관례를
// 따른다 — 응답 순서에 따라 다른 연도가 축으로 덮어써지는 사고를 막는다.
export const RESULT_YEARS = [2025, 2026];

// "2026 모집" / "2026 경쟁률" 열의 기준 연도.
// 2026학년도도 등급이 실려 있다(50%컷 16,082행 / 70%컷 16,678행) — "미발표 연도라
// grade_*가 원리상 전부 null"이라는 과거 전제는 실데이터로 반증됐다.
export const ACTIVE_RESULT_YEAR = 2026;

// 값이 없는 셀의 표기는 2종이다. 2개년 축에서는 "그해 전형 자체가 없었다"(2026 행의
// 40.8%가 짝 없음)와 "대학이 등급을 공개하지 않았다"의 구분 가치가 크다.
//   행 부재            → EMPTY_CELL       '-' (스쿨멘토는 '자료 없음', 사 #69)
//   행 존재 + 등급 null → UNDISCLOSED_CELL '미공개'
export const EMPTY_CELL = site.features.admissionResultsNotice
  ? "자료 없음"
  : "-";
export const UNDISCLOSED_CELL = "미공개";

// Δ 열에서 "전년 행이 아예 없어 비교 자체가 불가"한 셀의 표기.
export const NEW_CELL = "신규";

// 연도 셀의 3상태. 위 표기 2종 + 값 있음.
export const CELL_STATE = {
  VALUE: "value",
  UNDISCLOSED: "undisclosed",
  ABSENT: "absent",
};

// pickGrade가 훑는 컷 우선순위. 50 → 70 → 85 → 90 (§8.4 Tier 1).
// 85/90은 2025 전용이라 이 확장은 연도 간 "컷 기준 상이"를 구조적으로 늘린다 —
// Δ 계산이 그 상태를 흡수한다(computeDelta의 CUT_MISMATCH).
const GRADE_CUTS = [50, 70, 85, 90];

// ---------------------------------------------------------------------------
// 행 셰이프 — admissionResultsQueries.ts의 ADMISSION_RESULT_COLUMNS select 절 그대로.
// pickGrade가 `grade_${cut}` 동적 키로 훑으므로 인덱스 시그니처를 함께 둔다.
// ---------------------------------------------------------------------------

export type AdmissionResultRow = {
  result_year?: unknown;
  university_name?: unknown;
  department_name?: unknown;
  main_track?: unknown;
  screening_category?: unknown;
  admission_track?: unknown;
  quota?: unknown;
  competition_rate?: unknown;
  subject_reflection?: unknown;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

// PostgREST의 numeric 컬럼은 보통 JSON number로 내려오지만, 드라이버/버전에 따라
// 문자열로 오는 경우까지 방어한다. 빈 문자열·NaN·Infinity는 전부 null 취급.
function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function trimmed(value: unknown): string {
  return String(value ?? "").trim();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// main_track / admission_track이 null·빈 문자열인 행도 표에서는 한 덩어리로 묶여야
// 하므로 그룹 키를 하나로 정규화한다(null 그룹 1개 = 표 1행).
function groupKeyOf(value: unknown): string {
  const text = trimmed(value);
  return text === "" ? " __null__" : text;
}

function isNullGroupKey(key: string): boolean {
  return key === " __null__";
}

// 표 그룹키 구분자. 원자료(대학명·전형명·모집단위)에 등장하지 않는 문자를 쓴다.
// HTML 레퍼런스(454)의 `tracks[r[1]] + '§' + r[4]`와 동일한 (중심전형, 전형명) 축.
const GROUP_KEY_SEPARATOR = "§";

// 표 연도 축(RESULT_YEARS, 기본값) 밖의 행을 걸러낸다. 조회 단계(admissionResultsQueries.js
// .in('result_year', RESULT_YEARS))가 1차 방어이고, 이 함수는 buildDetailModel 진입부와
// buildTableRows / buildTrackSummaries 양쪽에서 각각 다시 호출하는 이중 방어다.
// 축 밖 행이 하나라도 평균·가중평균 집계에 섞이면 화면에 보이는 셀로 평균을 검산했을 때
// 절대 맞지 않는 사고가 난다(QA 결함 a).
function filterToYears(
  rows: AdmissionResultRow[] | null | undefined,
  years: number[],
): AdmissionResultRow[] {
  const yearSet = new Set(years);
  return (rows ?? []).filter((row) => yearSet.has(toNumber(row.result_year)!));
}

function rowsOfYear(
  rows: AdmissionResultRow[] | null | undefined,
  year: number,
): AdmissionResultRow[] {
  return (rows ?? []).filter((row) => toNumber(row.result_year) === year);
}

// ---------------------------------------------------------------------------
// (a) 표시 등급과 컷 라벨 — "2.24 (70)"
// ---------------------------------------------------------------------------

// 읽는 법 원문: "표시값은 최종등록자 교과등급으로, 50%컷을 우선 사용하고 없을 때
// 70%컷을 사용합니다." → 괄호 안 숫자는 고정 라벨이 아니라 실제 사용된 컷의 동적 표기다.
// 85/90%컷까지 4단으로 확장했다(§8.4 Tier 1) — 50·70이 둘 다 없어 '-'였던 59행에
// 값이 새로 생긴다. cut은 "어느 컷에서 온 값인가"라는 출처이며, Δ 계산이 두 연도의
// cut을 비교해 "컷 기준 상이" 상태를 만든다.
export function pickGrade(row) {
  if (!row) return { value: null, cut: null };
  for (const cut of GRADE_CUTS) {
    const value = toNumber(row[`grade_${cut}`]);
    if (value != null) return { value, cut };
  }
  return { value: null, cut: null };
}

// 등급 수치 + 컷 라벨 조합. 소수 자리는 항상 2자리 고정(시안 전 사례가 2자리).
function formatGradeWithCut(value, cut) {
  const num = toNumber(value);
  if (num == null) return EMPTY_CELL;
  return cut == null ? num.toFixed(2) : `${num.toFixed(2)} (${cut})`;
}

// 행 1개짜리 표 셀 문자열.
export function formatGradeCell(row) {
  const { value, cut } = pickGrade(row);
  return formatGradeWithCut(value, cut);
}

// 가중평균 값처럼 컷 라벨이 없는 등급 수치용 포맷.
export function formatGradeValue(value) {
  const num = toNumber(value);
  return num == null ? EMPTY_CELL : num.toFixed(2);
}

// "2026 모집" 셀. 분할모집(진성 중복 29행)이 있으므로 호출부는 합계를 넘긴다.
function formatQuota(value) {
  const num = toNumber(value);
  return num == null ? EMPTY_CELL : String(num);
}

// "2026 경쟁률" 셀. 시안 표기 "8.71 : 1".
// 경쟁률 0은 결측으로 승격한다(Q2) — 141건은 일부 대학이 미보고를 0으로 인코딩한
// 것으로 보이며, `0.00 : 1`이 정상값처럼 노출되면 오정보다. 적재 단계에서 이미
// null로 바뀌지만 어드민 기본값(quota 0 / competition_rate 0) 경로가 남아 있어
// 렌더 레이어에서도 한 번 더 막는다.
export function formatCompetitionRate(value) {
  const num = toNumber(value);
  if (num == null || num <= 0) return EMPTY_CELL;
  return `${num.toFixed(2)} : 1`;
}

// ---------------------------------------------------------------------------
// (b) 가중평균 — 요약 카드 대형 수치 & 연도 셀
// ---------------------------------------------------------------------------

// 산식: 모집인원(quota) 가중평균. 등급이 null인 행은 분자·분모 양쪽에서 제외한다.
//   weightedGrade = Σ( pickGrade(row).value × w(row) ) / Σ( w(row) )
//   w(row) = row.quota ?? 1   (quota 미기재 행은 가중치 1로 참여)
//
// sampleN / years를 반드시 함께 반환한다 — 표본 1건짜리 평균을 "가중평균"으로
// 표기하면 오정보이므로, 호출부가 라벨을 동적으로 만들 수 있어야 한다.
// cut / cuts는 표시 등급의 출처다. 한 덩어리 안에 컷 기준이 섞이면 cuts.length > 1이
// 되고, cut은 최초로 등장한(= 우선순위가 가장 높은 행의) 컷을 대표값으로 쓴다.
function weightedGrade(rows) {
  let numerator = 0;
  let denominator = 0;
  let sampleN = 0;
  const years = new Set<number>();
  const cuts = new Set<number>();
  let representativeCut: number | null = null;

  for (const row of rows ?? []) {
    const { value, cut } = pickGrade(row);
    if (value == null) continue;

    // quota가 0이거나 음수면 가중치로 쓸 수 없다(분모를 갉아먹거나 0이 된다) → 1로 대체.
    const rawWeight = toNumber(row.quota);
    const weight = rawWeight != null && rawWeight > 0 ? rawWeight : 1;

    numerator += value * weight;
    denominator += weight;
    sampleN += 1;

    if (cut != null) {
      cuts.add(cut);
      if (representativeCut == null) representativeCut = cut;
    }

    const year = toNumber(row.result_year);
    if (year != null) years.add(year);
  }

  if (denominator === 0)
    return { value: null, sampleN: 0, years: [], cut: null, cuts: [] };

  return {
    value: round2(numerator / denominator),
    sampleN,
    years: [...years].sort((a, b) => a - b),
    cut: representativeCut,
    cuts: [...cuts].sort((a, b) => a - b),
  };
}

// 요약 카드 라벨. 표본이 1개년뿐일 때 "가중평균" 단어를 쓰지 않는 것이 핵심 규칙.
function summaryCardLabel(track, years) {
  const name = trimmed(track);
  const list = years ?? [];
  if (list.length >= 2) return `${name} · ${list.length}개년 가중평균`;
  if (list.length === 1) return `${name} · ${list[0]}학년도`;
  return name;
}

// 한 연도 몫의 셀 1개. 표 셀과 카드 시계열이 같은 규칙을 쓰도록 한 곳에 모은다.
// 같은 연도에 행이 여럿이면(분할모집 29행) 임의의 1행을 고르지 않고 가중평균한다.
function buildYearCell(rows, year) {
  const yearRows = rowsOfYear(rows, year);
  if (yearRows.length === 0) {
    return {
      year,
      value: null,
      cut: null,
      cuts: [],
      state: CELL_STATE.ABSENT,
      rowCount: 0,
      display: EMPTY_CELL,
    };
  }

  const { value, cut, cuts, sampleN } = weightedGrade(yearRows);
  if (value == null) {
    return {
      year,
      value: null,
      cut: null,
      cuts: [],
      state: CELL_STATE.UNDISCLOSED,
      rowCount: yearRows.length,
      display: UNDISCLOSED_CELL,
    };
  }

  return {
    year,
    value,
    cut,
    cuts,
    state: CELL_STATE.VALUE,
    rowCount: yearRows.length,
    sampleN,
    display: formatGradeWithCut(value, cut),
  };
}

// 그 연도 행들의 모집인원 합계. 분할모집에서 절반만 보이던 결함 수정(HTML 469).
function sumQuota(rows, year) {
  let total: number | null = null;
  for (const row of rowsOfYear(rows, year)) {
    const quota = toNumber(row.quota);
    if (quota == null) continue;
    total = (total ?? 0) + quota;
  }
  return total;
}

// 그 연도 행들의 경쟁률 평균. 합계가 아니라 평균이다(HTML 470, 476).
// 0은 결측 승격(Q2)이라 평균 계산에서 아예 뺀다.
function averageCompetitionRate(rows, year) {
  let total = 0;
  let count = 0;
  for (const row of rowsOfYear(rows, year)) {
    const rate = toNumber(row.competition_rate);
    if (rate == null || rate <= 0) continue;
    total += rate;
    count += 1;
  }
  return count === 0 ? null : round2(total / count);
}

// ---------------------------------------------------------------------------
// (c) Δ 전년대비 — 5상태 순수 함수
// ---------------------------------------------------------------------------

// 2점은 정의상 추세(trend)가 아니라 변화(change)다. 세로 스케일을 만들지 않고
// 부호·크기·상태만 계산해 넘긴다(§8.3).
export const DELTA_STATE = {
  IMPROVED: "improved", // 등급 수치 감소 = 성적 상승
  WORSENED: "worsened", // 등급 수치 증가 = 성적 하락
  SAME: "same",
  INCOMPARABLE: "incomparable", // 한쪽 연도에 값이 없음 (2026 행의 40.8%)
  CUT_MISMATCH: "cut_mismatch", // 양쪽 다 값은 있으나 컷 기준이 다름 (10,506쌍 중 440, 4.2%)
};

// 등급은 낮을수록 상위다. 화살표만으로는 "올랐다"가 등급 상승인지 성적 상승인지
// 반대로 읽히므로 한국어 라벨을 반드시 병기한다.
const DELTA_DIRECTION_LABEL = {
  [DELTA_STATE.IMPROVED]: "상승",
  [DELTA_STATE.WORSENED]: "하락",
  [DELTA_STATE.SAME]: "변동 없음",
};

const DELTA_ARROW = {
  [DELTA_STATE.IMPROVED]: "▼",
  [DELTA_STATE.WORSENED]: "▲",
  [DELTA_STATE.SAME]: "—",
};

// 컷 기준이 다를 때 화면이 덧붙일 주석. 톤은 중립(회)으로 낮춘다.
export const CUT_MISMATCH_NOTE = "컷 기준 상이";

// Δ 계산 본체. previous / current는 buildYearCell 결과(또는 { year, value, cut }
// 모양의 임의 객체)를 그대로 받는다.
//
// 반환 객체
//   state        DELTA_STATE 5종 중 하나
//   direction    IMPROVED | WORSENED | SAME | null — CUT_MISMATCH일 때도 방향은 살아 있다
//   delta        변화량 절대값(2자리 반올림) | null
//   raw          current - previous 부호 있는 원값(음수 = 성적 상승) | null
//   arrow        '▼' | '▲' | '—' | null
//   tone         'up' | 'down' | 'flat' | 'muted'  — 화면 색 토큰 힌트
//   label        '0.43 상승' | '변동 없음' | '2026만 수록' | '수록 없음'
//   display      표 Δ 열 셀 4종: '▼0.43' | '▲0.21' | '신규' | '-'
//   note         CUT_MISMATCH_NOTE | null
//   cutMismatch  boolean
//   availableYear  INCOMPARABLE일 때 값이 있는 쪽 연도 | null
export function computeDelta(previous, current) {
  const previousValue = toNumber(previous?.value);
  const currentValue = toNumber(current?.value);
  const previousYear = toNumber(previous?.year);
  const currentYear = toNumber(current?.year);
  const previousCut = previousValue == null ? null : (previous?.cut ?? null);
  const currentCut = currentValue == null ? null : (current?.cut ?? null);

  if (previousValue == null || currentValue == null) {
    const availableYear =
      currentValue != null
        ? currentYear
        : previousValue != null
          ? previousYear
          : null;
    return {
      state: DELTA_STATE.INCOMPARABLE,
      direction: null,
      delta: null,
      raw: null,
      previousValue,
      currentValue,
      previousCut,
      currentCut,
      cutMismatch: false,
      availableYear,
      arrow: null,
      tone: "muted",
      label: availableYear == null ? "수록 없음" : `${availableYear}만 수록`,
      // 전년이 없고 올해만 있으면 '신규', 그 밖(올해가 없음/양쪽 다 없음)은 '-'.
      display:
        currentValue != null && previousValue == null ? NEW_CELL : EMPTY_CELL,
      note: null,
    };
  }

  const raw = round2(currentValue - previousValue);
  const delta = Math.abs(raw);
  const direction =
    raw < 0
      ? DELTA_STATE.IMPROVED
      : raw > 0
        ? DELTA_STATE.WORSENED
        : DELTA_STATE.SAME;
  const cutMismatch =
    previousCut != null && currentCut != null && previousCut !== currentCut;

  const arrow = DELTA_ARROW[direction];
  const tone = (() => {
    if (cutMismatch) return "muted";
    if (direction === DELTA_STATE.IMPROVED) return "up";
    if (direction === DELTA_STATE.WORSENED) return "down";
    return "flat";
  })();

  return {
    // 컷 기준이 다르면 Δ 계산은 하되 상태를 CUT_MISMATCH로 승격해 톤을 낮춘다.
    state: cutMismatch ? DELTA_STATE.CUT_MISMATCH : direction,
    direction,
    delta,
    raw,
    previousValue,
    currentValue,
    previousCut,
    currentCut,
    cutMismatch,
    availableYear: null,
    arrow,
    tone,
    label:
      direction === DELTA_STATE.SAME
        ? DELTA_DIRECTION_LABEL[direction]
        : `${delta.toFixed(2)} ${DELTA_DIRECTION_LABEL[direction]}`,
    display:
      direction === DELTA_STATE.SAME ? arrow : `${arrow}${delta.toFixed(2)}`,
    note: cutMismatch ? CUT_MISMATCH_NOTE : null,
  };
}

// 연도 시계열(오름차순 연도 축) → Δ. 축의 첫 연도와 마지막 연도를 비교한다.
// 2개년 축에서는 (2025, 2026)이 그대로 잡힌다.
export function computeDeltaFromSeries(series) {
  const list = [...(series ?? [])].sort(
    (a, b) => (toNumber(a?.year) ?? 0) - (toNumber(b?.year) ?? 0),
  );
  if (list.length === 0) return computeDelta(null, null);
  if (list.length === 1) return computeDelta(null, list[0]);
  return computeDelta(list[0], list[list.length - 1]);
}

// ---------------------------------------------------------------------------
// (d) 전형유형 분류 — 탭 11종
// ---------------------------------------------------------------------------

// admission_results에는 screening_category 컬럼이 직접 실려 있다. 있으면 그 값을 그대로
// 신뢰하고(추측하지 않는다), 없을 때만(null) 아래 정규식 규칙으로 admission_track /
// main_track 문자열을 추론한다. 정규식은 screening_category가 비어 있는 레거시 잔존
// 행을 위한 fallback 전용이다. 우선순위 순서대로 최초 매치를 채택한다.
//
// ⚠ 과거 opportunity 규칙에 `특수교육`이 들어 있어 특수교육 706행이 전량 기회균형
// 탭으로 흡수되는 버그가 있었다. 축이 11종이 된 지금은 특수교육이 독립 탭이므로
// opportunity 정규식에서 제거하고, 좁은 규칙을 먼저 두어 넓은 규칙이 삼키지 못하게 한다.
const CATEGORY_RULES = [
  {
    key: "overseas",
    label: "재외국민",
    test: (row) => /재외국민/.test(trimmed(row.admission_track)),
  },
  {
    key: "adult",
    label: "성인학습자",
    test: (row) => /성인학습자|만학도/.test(trimmed(row.admission_track)),
  },
  {
    key: "special",
    label: "특수교육",
    test: (row) => /특수교육/.test(trimmed(row.admission_track)),
  },
  {
    key: "vocational",
    label: "특성화고",
    test: (row) =>
      /특성화고|마이스터|전문계|실업계/.test(trimmed(row.admission_track)),
  },
  {
    key: "regional",
    label: "지역인재",
    test: (row) => /지역인재/.test(trimmed(row.admission_track)),
  },
  {
    key: "nongeochon",
    label: "농어촌",
    test: (row) => /농[·ㆍ・]?어촌/.test(trimmed(row.admission_track)),
  },
  {
    key: "opportunity",
    label: "기회균형",
    test: (row) =>
      /기회균형|기회균등|고른기회|사회통합|사회배려|기초생활|국가보훈/.test(
        trimmed(row.admission_track),
      ),
  },
  {
    key: "recommend",
    label: "추천형",
    test: (row) => /추천/.test(trimmed(row.admission_track)),
  },
  {
    key: "nonsul",
    label: "논술",
    // 논술·실기는 main_track 축이기도 해서 두 컬럼을 합쳐 검사한다.
    test: (row) =>
      /논술/.test(`${trimmed(row.main_track)} ${trimmed(row.admission_track)}`),
  },
  {
    key: "practical",
    label: "실기",
    test: (row) =>
      /실기/.test(`${trimmed(row.main_track)} ${trimmed(row.admission_track)}`),
  },
];

const FALLBACK_CATEGORY = { key: "general", label: "일반" };
const ETC_CATEGORY = { key: "etc", label: "기타" };

// screening_category 컬럼값 → 탭 키 매핑. 컬럼값을 그대로 신뢰하는 유일한 경로다.
// 원자료 11종 전부를 덮는다(과거 6종만 덮어 7,192행 16.7%가 정규식 fallback으로
// 잘못 내려가던 결함 해소). '기타'는 정규식으로는 도달할 수 없고 컬럼값으로만 온다.
const SCREENING_CATEGORY_MAP = {
  일반: FALLBACK_CATEGORY,
  추천형: { key: "recommend", label: "추천형" },
  지역인재: { key: "regional", label: "지역인재" },
  농어촌: { key: "nongeochon", label: "농어촌" },
  기회균형: { key: "opportunity", label: "기회균형" },
  특성화고: { key: "vocational", label: "특성화고" },
  특수교육: { key: "special", label: "특수교육" },
  실기: { key: "practical", label: "실기" },
  성인학습자: { key: "adult", label: "성인학습자" },
  논술: { key: "nonsul", label: "논술" },
  재외국민: { key: "overseas", label: "재외국민" },
  기타: ETC_CATEGORY,
};

// 탭 노출 순서 고정 (HTML 레퍼런스 441의 order 배열 + 기타는 맨 뒤).
// 행이 없는 카테고리는 탭 자체를 만들지 않는다.
export const CATEGORY_ORDER = [
  "general",
  "recommend",
  "regional",
  "nongeochon",
  "opportunity",
  "vocational",
  "special",
  "nonsul",
  "practical",
  "adult",
  "overseas",
  "etc",
];

// 전체 43,170행 기준 합 109행(0.25%)뿐인 꼬리 4종. 탭 접기 임계는 전체 분포를 봐야
// 정할 수 있는데 이 파일은 모집단위 1개분 행만 손에 쥐므로(모집단위 단위 count는
// 어느 유형이든 한 자릿수) 여기서 임계를 적용하지 않는다. 접기 여부는 화면이
// 이 목록을 보고 결정한다.
const TAIL_CATEGORY_KEYS = ["practical", "adult", "nonsul", "overseas"];

const CATEGORY_LABELS = {
  [FALLBACK_CATEGORY.key]: FALLBACK_CATEGORY.label,
  [ETC_CATEGORY.key]: ETC_CATEGORY.label,
  ...Object.fromEntries(CATEGORY_RULES.map((rule) => [rule.key, rule.label])),
};

export function categorize(row) {
  if (!row) return FALLBACK_CATEGORY;

  const screening = trimmed(row.screening_category);
  if (screening) {
    const mapped = SCREENING_CATEGORY_MAP[screening];
    // 매핑에 있는 값이면 그대로 신뢰하고 끝낸다. 도메인 밖 오타 등 매핑에 없는 값만
    // 정규식 fallback으로 내려간다(screening_category가 아예 없는 행과 동일하게 취급).
    if (mapped) return mapped;
  }

  const matched = CATEGORY_RULES.find((rule) => rule.test(row));
  return matched
    ? { key: matched.key, label: matched.label }
    : FALLBACK_CATEGORY;
}

// fallback 감시용. "미분류"가 아니라 "screening_category가 없거나 매핑 밖 값이라 전형명
// 추론으로 대신 분류함"의 감시다 — screening_category 컬럼값을 정상적으로 신뢰한 행(정상
// 적으로 '일반'으로 분류된 행 포함)은 여기 잡히지 않는다. 실데이터 적재 후 이 목록을 보고
// screening_category 적재 누락 여부나 CATEGORY_RULES 보정 필요 여부를 판단한다.
export function collectFallbackAdmissionTracks(rows) {
  const seen = new Set();
  for (const row of rows ?? []) {
    if (!row) continue;
    const screening = trimmed(row.screening_category);
    if (screening && SCREENING_CATEGORY_MAP[screening]) continue; // 컬럼값을 그대로 신뢰한 행
    const track = trimmed(row.admission_track);
    if (track) seen.add(track);
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// 상세 화면 집계 모델
// ---------------------------------------------------------------------------

// 요약 카드의 산정 기준(basis)을 고른다 (HTML summarize() 366-372 이식).
//
// 과거에는 한 main_track 안의 전형유형을 전부 섞어 가중평균했는데, (대학, 모집단위,
// 중심전형) 11,821그룹 중 6,674개(56.5%)가 2개 이상 전형유형 혼합이고 혼합평균과
// 일반-only 평균의 차가 median 0.04 / p90 0.245 / 437그룹은 0.3등급 이상이었다.
// 지역인재·농어촌 같은 별도 모집단이 "일반 지원자의 대표 등급"을 오염시킨 것이다.
//
// 규칙: '일반' 행이 있으면 '일반'만으로 평균. 없으면 모집인원 가중 최다 유형을 골라
// 그 유형만으로 평균하고, 어느 기준으로 냈는지 basis를 함께 반환한다.
function pickSummaryBasis(rows) {
  const list = rows ?? [];
  const general = list.filter(
    (row) => categorize(row).key === FALLBACK_CATEGORY.key,
  );
  if (general.length > 0) {
    return {
      basisKey: FALLBACK_CATEGORY.key,
      basis: FALLBACK_CATEGORY.label,
      rows: general,
    };
  }
  if (list.length === 0) {
    return { basisKey: null, basis: "", rows: [] };
  }

  // 모집인원 가중 최다 유형. quota 미기재 행은 1로 센다(가중평균 규칙과 동일).
  const weights = new Map<
    string,
    { key: string; label: string; weight: number }
  >();
  const order: string[] = [];
  for (const row of list) {
    const { key, label } = categorize(row);
    if (!weights.has(key)) {
      weights.set(key, { key, label, weight: 0 });
      order.push(key);
    }
    const rawWeight = toNumber(row.quota);
    // 바로 위에서 weights.set(key, ...)을 이미 거쳤으므로(신규거나 기존이거나) 항상 존재.
    const entry = weights.get(key)!;
    entry.weight += rawWeight != null && rawWeight > 0 ? rawWeight : 1;
  }

  // list.length===0은 위에서 이미 걸러졌으므로(early return) weights는 최소 1건 —
  // sort 결과 배열도 비지 않는다.
  const winner = [...weights.values()].sort(
    (a, b) =>
      b.weight - a.weight || order.indexOf(a.key) - order.indexOf(b.key),
  )[0]!;

  return {
    basisKey: winner.key,
    basis: winner.label,
    rows: list.filter((row) => categorize(row).key === winner.key),
  };
}

// 요약 카드 — main_track(중심전형) 별 대표 등급.
// 하드코딩 라벨 금지: 데이터에 실제로 존재하는 main_track 값을 그대로 라벨로 쓴다.
// limit 기본값 4 (Q7). 2026은 중심전형이 교과/종합 2종뿐이라 대부분 2장 이하다.
// 등급이 없는 track도 카드를 만든다(HTML .card.void 403·407) — hasValue=false로
// 표시하고, 화면이 "등급 미제공" 사유 문구를 붙인다. 카드를 통째로 지워 버리면
// "그 중심전형으로 모집은 하는데 등급만 없다"는 사실이 화면에서 사라진다.
export function buildTrackSummaries(
  rows,
  { limit = 4, years = RESULT_YEARS } = {},
) {
  const scoped = filterToYears(rows, years); // 축 밖 연도 방어 (이중 방어 — buildDetailModel 진입부와 함께)
  const buckets = new Map();

  for (const row of scoped) {
    const track = trimmed(row.main_track);
    if (!track) continue; // 라벨을 만들 수 없는 행은 카드 대상에서 제외
    if (!buckets.has(track))
      buckets.set(track, { track, rows: [], order: buckets.size });
    buckets.get(track).rows.push(row);
  }

  // 아래 push 리터럴의 정확한 셰이프를 새로 타이핑하지 않는다(파일 전체가
  // JSDoc 시절부터 무타입 rows/row를 다뤄 왔다) — 뒤에서 실제로 읽는
  // rowCount/order 두 필드만 명시하고 나머지는 인덱스 시그니처로 통과시킨다.
  const cards: (Record<string, unknown> & {
    rowCount: number;
    order: number;
  })[] = [];
  for (const bucket of buckets.values()) {
    const { basisKey, basis, rows: basisRows } = pickSummaryBasis(bucket.rows);
    const summary = weightedGrade(basisRows);
    const series = buildTrackSeries(basisRows, { years });

    cards.push({
      track: bucket.track,
      // 산정 기준. 화면이 "일반 전형 기준" / "지역인재 기준"을 표기할 수 있어야 한다.
      basis,
      basisKey,
      isGeneralBasis: basisKey === FALLBACK_CATEGORY.key,
      hasValue: summary.value != null,
      value: summary.value,
      displayValue: formatGradeValue(summary.value),
      cut: summary.cut,
      cuts: summary.cuts,
      sampleN: summary.sampleN,
      years: summary.years, // 값이 실제로 존재하는 연도 (축 상수가 아니다)
      label: summaryCardLabel(bucket.track, summary.years),
      rowCount: bucket.rows.length,
      basisRowCount: basisRows.length,
      // 2개년 슬로프용 연도별 등급 (등급이 없는 연도는 value null + state로 사유 구분)
      series,
      delta: computeDeltaFromSeries(series),
      // 카드 부제 — 기준 연도 모집인원 합계 / 경쟁률 평균 (HTML 471-472)
      activeQuota: sumQuota(basisRows, ACTIVE_RESULT_YEAR),
      activeQuotaDisplay: formatQuota(sumQuota(basisRows, ACTIVE_RESULT_YEAR)),
      activeCompetitionRate: averageCompetitionRate(
        basisRows,
        ACTIVE_RESULT_YEAR,
      ),
      activeCompetitionRateDisplay: formatCompetitionRate(
        averageCompetitionRate(basisRows, ACTIVE_RESULT_YEAR),
      ),
      order: bucket.order,
    });
  }

  return cards
    .sort((a, b) => b.rowCount - a.rowCount || a.order - b.order)
    .slice(0, limit)
    .map(({ order: _order, ...card }) => card);
}

// 연도축 시계열. 한 연도에 여러 행이 있으면 그 연도의 가중평균을 쓴다.
// 셀 3상태(값 / 미공개 / 행 부재)를 그대로 실어 화면이 "-"와 "미공개"를 구분할 수 있게 한다.
function buildTrackSeries(rows, { years = RESULT_YEARS } = {}) {
  return years.map((year) => buildYearCell(rows, year));
}

// 전형 1개 = 표 1행. 그룹키는 (중심전형, 전형명)이다 — HTML 454와 동일 축.
// admission_track 단독으로 묶으면 같은 전형명의 교과/종합 2행(983그룹)이 1행으로
// 뭉개지고 등급이 있는 쪽만 임의 채택돼 값 절반이 조용히 사라진다.
export function buildTableRows(rows, { years = RESULT_YEARS } = {}) {
  const scoped = filterToYears(rows, years); // 축 밖 연도 방어 (이중 방어 — buildDetailModel 진입부와 함께)
  const buckets = new Map();

  for (const row of scoped) {
    const key = `${groupKeyOf(row.main_track)}${GROUP_KEY_SEPARATOR}${groupKeyOf(row.admission_track)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  // Q3가 main_track → admission_track → result_year 순으로 정렬해 내려주므로
  // 최초 등장 순서를 그대로 보존한다.
  return [...buckets.entries()].map(([key, groupRows]) => {
    const [mainKey, trackKey] = key.split(GROUP_KEY_SEPARATOR);
    const cells = years.map((year) => buildYearCell(groupRows, year));
    const activeQuota = sumQuota(groupRows, ACTIVE_RESULT_YEAR);
    const activeCompetitionRate = averageCompetitionRate(
      groupRows,
      ACTIVE_RESULT_YEAR,
    );
    const subjectReflection =
      groupRows.map((row) => trimmed(row.subject_reflection)).find(Boolean) ??
      "";
    const { key: categoryKey, label: categoryLabel } = categorize(groupRows[0]);

    return {
      key,
      admissionType: isNullGroupKey(trackKey) ? EMPTY_CELL : trackKey,
      mainTrack: isNullGroupKey(mainKey) ? "" : mainKey,
      categoryKey,
      categoryLabel,
      subjectReflection: subjectReflection || EMPTY_CELL,
      cells,
      // Δ 전년대비 열 (구 "평균" 열 대체). 2개년에서 평균은 화면에 이미 보이는 두 수의
      // 재계산이라 정보량이 0이고, 50%컷·70%컷 혼합 평균이라 의미도 불명이었다.
      delta: computeDeltaFromSeries(cells),
      activeQuota,
      activeQuotaDisplay: formatQuota(activeQuota),
      activeCompetitionRate,
      activeCompetitionRateDisplay: formatCompetitionRate(
        activeCompetitionRate,
      ),
      rowCount: groupRows.length,
      rows: groupRows,
    };
  });
}

// 탭 = 행이 1개 이상 존재하는 카테고리만. count는 그 탭의 표 행 수
// (= (중심전형, 전형명) distinct 개수)다.
export function buildCategories(rows, { years = RESULT_YEARS } = {}) {
  const buckets = new Map();

  for (const row of rows ?? []) {
    const { key } = categorize(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  return CATEGORY_ORDER.filter(
    (key) => (buckets.get(key)?.length ?? 0) > 0,
  ).map((key) => {
    const categoryRows = buckets.get(key);
    const tableRows = buildTableRows(categoryRows, { years });
    return {
      key,
      label: CATEGORY_LABELS[key],
      count: tableRows.length,
      isTail: TAIL_CATEGORY_KEYS.includes(key),
      rows: categoryRows,
      tableRows,
    };
  });
}

// 초기 활성 탭 = '일반' 우선, 없으면 건수 최다(동률이면 CATEGORY_ORDER 상 앞선 것).
// 탭이 6→11종이 되면서 "행수 최다"만 보면 지역인재·농어촌이 기본 선택되는 모집단위가
// 생긴다. 사용자가 먼저 보고 싶은 것은 언제나 일반 전형이므로 '일반'을 우선한다.
export function pickInitialCategoryKey(categories) {
  const list = categories ?? [];
  if (list.length === 0) return null;
  const general = list.find(
    (category) => category.key === FALLBACK_CATEGORY.key,
  );
  if (general) return general.key;
  return list.reduce(
    (best, current) => (current.count > best.count ? current : best),
    list[0],
  ).key;
}

// 상세 화면이 필요로 하는 집계 전체를 한 번에 만든다. 탭 전환 시 재요청 없이
// 이 결과를 useMemo로 잡아 두고 클라이언트에서 필터한다.
export function buildDetailModel(
  rows,
  { years = RESULT_YEARS, summaryLimit = 4 } = {},
) {
  // 축 밖 연도 방어 — 조회 단계(.in('result_year', RESULT_YEARS))와 이중 방어.
  // 여기서 한 번 걸러 두면 이어지는 buildTrackSummaries/buildCategories/buildTableRows가
  // 전부 이미 걸러진 리스트를 받는다(각 함수 내부에도 filterToYears를 한 번 더 건다).
  const list = filterToYears(rows, years);
  const categories = buildCategories(list, { years });

  // 축 상수(years)가 아니라 실제로 행이 존재하는 연도. "N개년" 카피는 이쪽을 써야 한다
  // — 2025뿐인 모집단위에서 "2개년"이라 쓰면 거짓이다.
  const observedYears = years.filter(
    (year) => rowsOfYear(list, year).length > 0,
  );

  return {
    rowCount: list.length,
    isEmpty: list.length === 0,
    // 딥링크(?u=&d=)로 바로 들어온 경우 셀렉터 목록이 손에 없어도 히어로 h1을
    // 그릴 수 있도록 Q3가 university_name / department_name을 함께 받아 온다.
    universityName:
      list.map((row) => trimmed(row.university_name)).find(Boolean) ?? "",
    departmentName:
      list.map((row) => trimmed(row.department_name)).find(Boolean) ?? "",
    trackSummaries: buildTrackSummaries(list, { limit: summaryLimit, years }),
    categories,
    initialCategoryKey: pickInitialCategoryKey(categories),
    fallbackAdmissionTracks: collectFallbackAdmissionTracks(list),
    years,
    observedYears,
  };
}
