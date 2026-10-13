// 입결 컷 규칙과 대학, 학과 이름 정규화. 서버 조회와 설문 검색(프런트)이 같은 규칙을 쓰도록
// 의존 없는 순수 함수로만 둔다.

/** 리포트 입결 비교에 쓰는 전형 구분. 지역인재, 농어촌, 기회균형 등은 제외한다. */
export const CUT_SCREENING_CATEGORIES = ["일반", "추천형"] as const;

export type CutSource = {
  grade_50: number | null;
  grade_70: number | null;
  screening_category: string | null;
};

/**
 * 한 행의 컷 등급. 일반, 추천형 전형만 인정하고 grade_50 이 없으면 grade_70 으로 대체한다.
 * 둘 다 없거나 대상 전형이 아니면 null.
 */
export function admissionCutValue(row: CutSource): number | null {
  const category = row.screening_category;
  if (
    category === null ||
    !(CUT_SCREENING_CATEGORIES as readonly string[]).includes(category)
  ) {
    return null;
  }
  return row.grade_50 ?? row.grade_70 ?? null;
}

/**
 * 대학명 조회 키. 공백을 지우고 끝의 "대학교"를 "대"로 줄인다(DB 는 "고려대" 같은 축약형).
 * 괄호 캠퍼스는 그대로 둔다. 저장값은 바꾸지 않고 조회 시점에만 쓴다.
 */
export function normalizeUniversityKey(input: string): string {
  return input.replace(/\s+/g, "").replace(/대학교(?=(\([^)]*\))?$)/, "대");
}

/** 학과명 비교 키. 공백만 지운다. */
export function normalizeDepartmentKey(input: string): string {
  return input.replace(/\s+/g, "");
}
