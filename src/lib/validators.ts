// 폼 입력 검증 유틸 단일 정본.
//
// 왜 만들었나 —
//   같은 이메일 정규식이 5곳(Signup.jsx / signup/UnifiedSignupForm.jsx / signup/StudentForm.jsx /
//   signup/Under14Form.jsx / signup/parent/ParentForm.jsx)에 리터럴로 복붙돼 있었다. 멘토신청
//   폼(docs/mentor-apply-spec.md §폼 명세)이 6번째 사본을 만들지 않도록 여기로 뽑았다.
//   **기존 5곳의 동작은 바꾸지 않았다** — 정규식·비교 방식을 그대로 옮겼을 뿐이므로, 나중에
//   기존 화면을 이 모듈로 교체하더라도 판정 결과는 동일하다.
//
// 전화번호는 여기에 만들지 마라 —
//   normalizePhone / isValidMobile 은 이미 src/lib/phoneVerification.js 에 있고 서버
//   (api/_lib/phoneCode.js)와 규칙이 짝을 이룬다. 여기에 사본을 두면 두 규칙이 조용히 갈라진다.
//   import { normalizePhone, isValidMobile } from './phoneVerification';

// 기존 5곳이 쓰던 정규식 그대로. 의도적으로 느슨하다(TLD·길이 제한 없음) —
// 최종 판정은 어차피 발송 성공 여부이고, 과한 정규식은 정상 주소를 막는 쪽이 더 흔하다.
// trim 하지 않는 것도 기존 동작 유지다([^\s@]+ 가 앞뒤 공백을 이미 거부한다).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string) {
  return EMAIL_REGEX.test(value);
}

// 생년월일 YYYYMMDD 8자리 + 실제 존재하는 날짜인지.
//
// 판정 규칙은 src/context/SignupContext.jsx 의 computeIsUnder14 와 동일하다(8자리 / 1900년 이상 /
// Date 롤오버 역검증 / 미래 날짜 거부). computeIsUnder14 를 재사용하지 않는 이유는 그 함수가
// "만 14세 미만인가"를 돌려주기 때문이다 — 성인 지원자에게는 false 와 null(=검증 실패)을
// 구분해 쓰기가 어색해서, 형식 검증만 하는 함수를 따로 둔다.
//
// Date 는 month=13, day=32 같은 범위 밖 값을 다음 달/해로 조용히 롤오버시켜 전혀 다른 날짜를
// 만든다(2024-02-30 → 2024-03-01). 그래서 만들어진 Date 를 다시 분해해 입력과 대조한다.
export function isValidBirthDate(value: unknown) {
  const digits = String(value ?? "");

  if (!/^\d{8}$/.test(digits)) return false;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));

  if (year < 1900) return false;

  const birth = new Date(year, month - 1, day);

  if (Number.isNaN(birth.getTime())) return false;
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return false;
  }

  return birth.getTime() <= Date.now();
}

// 입학년도 하한. 시안에 범위 정의가 없어(명세 §폼 명세 2-3 "4자리 연도 — 범위 미정의")
// 실무 하한을 잡았다: 대학 재학·휴학·졸업생이 지원 대상이므로 1990년보다 이른 입학년도는
// 오타로 보는 편이 안전하다. 상한은 재수 없이 다음 해 입학 예정인 경우를 허용해 현재연도 + 1.
// 확정 수치가 내려오면 이 두 값만 고치면 된다.
const MIN_ADMISSION_YEAR = 1990;

export function isValidAdmissionYear(value: unknown) {
  const digits = String(value ?? "");

  if (!/^\d{4}$/.test(digits)) return false;

  const year = Number(digits);

  return year >= MIN_ADMISSION_YEAR && year <= new Date().getFullYear() + 1;
}

// textarea 글자수 상한(600 / 800 / 1000 / 2000자) 검사.
// 기준은 JS 문자열 length(UTF-16 코드유닛)다 — 서버 재검증(api/_routes/mentor-apply.js)도 반드시
// 같은 기준을 써야 클라이언트에서 통과한 값이 서버에서 거절되는 일이 없다.
// 값이 비어 있으면 true 다(필수 여부는 이 함수의 책임이 아니다).
export function isWithinMaxLength(value: unknown, max: number) {
  return String(value ?? "").length <= max;
}
