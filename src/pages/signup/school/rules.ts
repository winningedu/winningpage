// 학교 학생 가입 입력 규칙(결정 70, 교 결정 r10).
// 학년 선택지는 서버 학적 검증(student_enrollments CHECK)과 같은 목록을 쓴다.
export { ENROLLMENT_GRADES } from "../../../../api/_lib/console/enrollmentInput";

const USERNAME_PATTERN = /^[a-z0-9]{4,20}$/;
const CLASS_NUMBER_PATTERN = /^[1-9][0-9]?$/;

export function isValidUsername(value: string) {
  return USERNAME_PATTERN.test(value);
}

// 번호는 1에서 99까지 숫자. 비우는 것은 호출부가 먼저 거른다.
export function isValidClassNumber(value: string) {
  return CLASS_NUMBER_PATTERN.test(value);
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
