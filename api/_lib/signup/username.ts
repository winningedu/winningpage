// 학생 아이디 형식(결정 70): 영문 소문자와 숫자 4~20자, @ 없음. DB 의 fn_student_signup 과 같은 규칙이다.
// 입력은 앞뒤 공백을 자르고 소문자로 맞춘 뒤 검사한다(DB 도 lower(btrim()) 로 저장한다).

const USERNAME_PATTERN = /^[a-z0-9]{4,20}$/;

/** 형식이 맞으면 정규화한 아이디, 아니면 null. */
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : null;
}
