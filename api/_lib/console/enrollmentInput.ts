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

export function isEnrollmentNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= ENROLLMENT_NUMBER_MIN &&
    value <= ENROLLMENT_NUMBER_MAX
  );
}
