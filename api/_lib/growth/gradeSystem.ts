// 성장설계 등급 체계 판정·평균 계산(순수 함수). 등급 체계는 앱이 정하며 생성 결과가 덮어쓰지 못한다(No.120).

export type GradeSystem = "five" | "nine";

/** 5등급제 적용 첫 입학 연도 */
const FIVE_SCALE_START_YEAR = 2025;

/** 고등학교 입학 연도로 등급 체계 판정. 2025 이상 five, 2024 이하 nine (No.73, No.153). */
export function deriveGradeSystem(
  admissionYear: number | null | undefined,
): GradeSystem | null {
  if (admissionYear == null || !Number.isInteger(admissionYear)) return null;
  return admissionYear >= FIVE_SCALE_START_YEAR ? "five" : "nine";
}

export interface GradeBand {
  grade: number;
  /** 상위 누적 백분위 상한(이 값 이하면 해당 등급) */
  cumulativePercent: number;
}

/** 5등급제 누적 비율 구간 (No.74) */
export const FIVE_SCALE_BANDS: readonly GradeBand[] = [
  { grade: 1, cumulativePercent: 10 },
  { grade: 2, cumulativePercent: 34 },
  { grade: 3, cumulativePercent: 66 },
  { grade: 4, cumulativePercent: 90 },
  { grade: 5, cumulativePercent: 100 },
];

/** 9등급제 누적 비율 구간 */
export const NINE_SCALE_BANDS: readonly GradeBand[] = [
  { grade: 1, cumulativePercent: 4 },
  { grade: 2, cumulativePercent: 11 },
  { grade: 3, cumulativePercent: 23 },
  { grade: 4, cumulativePercent: 40 },
  { grade: 5, cumulativePercent: 60 },
  { grade: 6, cumulativePercent: 77 },
  { grade: 7, cumulativePercent: 89 },
  { grade: 8, cumulativePercent: 96 },
  { grade: 9, cumulativePercent: 100 },
];

/** 상위 누적 백분위(0~100)로 등급 산출. 범위 밖이면 null. */
export function gradeFromPercentile(
  percentile: number,
  system: GradeSystem,
): number | null {
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 100) {
    return null;
  }
  const bands = system === "five" ? FIVE_SCALE_BANDS : NINE_SCALE_BANDS;
  const band = bands.find((b) => percentile <= b.cumulativePercent);
  return band ? band.grade : null;
}

/**
 * 2022 개정 교육과정 사회·과학 융합선택 과목(공식 목록). 평균 계산에서 제외 (No.75, No.154).
 * 출처: 2022 개정 교육과정 고등학교 선택 과목 구분(교육부 고시) 기준, 검토용으로 export.
 */
export const FUSION_ELECTIVE_SUBJECTS: readonly string[] = [
  // 사회
  "여행지리",
  "역사로 탐구하는 현대 세계",
  "사회문제 탐구",
  "금융과 경제생활",
  "윤리문제 탐구",
  "기후변화와 지속가능한 세계",
  // 과학
  "과학의 역사와 문화",
  "기후변화와 환경생태",
  "융합과학 탐구",
];

/**
 * 체육·예술·교양 교과 및 과학탐구실험 과목. 평균 계산에서 제외 (No.75, No.154).
 * 목표관리 naesin_scores 에는 선택과목 유형·성취도가 없어 과목명 사전으로 판정한다.
 */
export const NON_ACADEMIC_SUBJECTS: readonly string[] = [
  // 체육
  "체육",
  "운동과 건강",
  // 예술
  "음악",
  "미술",
  "연극",
  // 교양
  "철학",
  "논리학",
  "심리학",
  "교육학",
  "종교학",
  "진로와 직업",
  "생태와 환경",
  "인간과 경제활동",
  "논술",
  // 과학탐구실험
  "과학탐구실험1",
  "과학탐구실험2",
];

/** 과목명 비교용 정규화: 공백 제거, 로마숫자 Ⅰ/Ⅱ 를 1/2 로 통일 */
function normalizeSubjectName(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/Ⅰ/g, "1")
    .replace(/Ⅱ/g, "2");
}

const normalizedExcluded = new Set<string>(
  [...FUSION_ELECTIVE_SUBJECTS, ...NON_ACADEMIC_SUBJECTS].map(
    normalizeSubjectName,
  ),
);

/** 평균 계산 제외 과목 여부. 사전에 없는 이름은 false. */
export function isExcludedFromAverage(subjectName: string): boolean {
  return normalizedExcluded.has(normalizeSubjectName(subjectName));
}

export interface SubjectGrade {
  name: string;
  grade: number | null;
}

export interface AverageGradeResult {
  average: number | null;
  included: string[];
  excluded: string[];
}

/**
 * 제외 과목과 등급 null 과목을 뺀 산술평균(소수 둘째 자리 반올림).
 * 성취도를 등급으로 환산하지 않는다(No.154).
 */
export function averageGrade(subjects: SubjectGrade[]): AverageGradeResult {
  const included: string[] = [];
  const excluded: string[] = [];
  let sum = 0;
  for (const { name, grade } of subjects) {
    if (isExcludedFromAverage(name)) {
      excluded.push(name);
    } else if (grade !== null) {
      included.push(name);
      sum += grade;
    }
  }
  const average =
    included.length === 0
      ? null
      : Math.round((sum / included.length) * 100) / 100;
  return { average, included, excluded };
}

export interface SemesterSubjects {
  /** 학기 키. "고1-1" 형식 문자열을 그대로 보존한다. */
  key: string;
  subjects: SubjectGrade[];
}

export interface SemesterAverage extends AverageGradeResult {
  key: string;
}

/** 학기별 averageGrade 매핑 */
export function semesterAverages(
  semesters: SemesterSubjects[],
): SemesterAverage[] {
  return semesters.map(({ key, subjects }) => ({
    key,
    ...averageGrade(subjects),
  }));
}
