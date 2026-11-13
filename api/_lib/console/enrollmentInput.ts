// 학적 입력 검증 상수와 판정. 학급 직접 수정(console/students/enrollment), 스스로 배정, 변경 신청 라우트가
// 함께 쓴다. 값은 student_enrollments 의 grade, number CHECK 와 같아야 한다.

export const ENROLLMENT_GRADES = [
  "중1",
  "중2",
  "중3",
  "고1",
  "고2",
  "고3",
] as const;

export const ENROLLMENT_NUMBER_MIN = 1;
export const ENROLLMENT_NUMBER_MAX = 99;

export function isEnrollmentGrade(value: unknown): value is string {
  return ENROLLMENT_GRADES.some((g) => g === value);
}

/** 목록 필터에서 다학년(학년 없는 학급)을 가리키는 값. 학생의 학년 값이 아니다. */
export const MIXED_GRADE = "mixed";

export function isGradeFilter(value: unknown): value is string {
  return value === MIXED_GRADE || isEnrollmentGrade(value);
}

/**
 * grade 필터 판정. mixed 는 학급에 학년이 없는 줄(학생 학년과 상관없이), 그 밖의 값은 own 학년과 같은 줄.
 * 학급 목록은 own 에 학급 학년을, 학생 목록은 학생 학년을 넘긴다. classGrade 가 undefined 면 학급을 찾지 못한 것이다.
 */
export function gradeFilterMatches(
  filter: string | undefined,
  own: string | null,
  classGrade: string | null | undefined,
): boolean {
  if (!filter) return true;
  return filter === MIXED_GRADE ? classGrade === null : own === filter;
}

export function isEnrollmentNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= ENROLLMENT_NUMBER_MIN &&
    value <= ENROLLMENT_NUMBER_MAX
  );
}
