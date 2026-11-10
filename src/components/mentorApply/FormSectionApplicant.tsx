// 멘토 지원서 폼 — 1. 지원자 정보 (3372:4059) / docs/mentor-apply-spec.md §폼 명세 섹션 1.
//
// 왜 섹션마다 파일을 쪼갰나 —
//   폼 5개 섹션의 필드가 30개라 한 파일에 몰면 1,000줄을 넘고, 필드 하나를 고치려 해도
//   전체를 스크롤해야 한다. 섹션 = 시안의 카드 = 사이드바 진행률 단위 = 검증 단위가 정확히
//   일치하므로 이 경계로 자른다.
//
// 상태를 소유하지 않는다 —
//   `{ values, errors, onChange }` 만 받는 제어 컴포넌트다. 상태는 MentorApply.jsx 가
//   useState + updateField 로 단일 소유한다(저장소 관례: PremiumApply.jsx:26-33,52-54).
//   폼 라이브러리는 도입하지 않는다.
//
// 필드 name 은 DB 컬럼명(sql/52_mentor_applications.sql) / 제출 API 본문 키
//   (api/_routes/mentor-apply.js)와 **문자 그대로 동일**하다. 화면 상태 객체를 그대로 JSON 으로
//   보낼 수 있어야 매핑 테이블이라는 무의미한 중간 계층이 생기지 않는다.
//
// ⚠ `phone` 은 이 섹션(1-3 휴대폰 번호)과 5번 섹션(5-2 휴대폰 본인인증)이 **같은 키를 공유**한다.
//    DB 에 phone 컬럼이 하나뿐이고(sql/52 L66) 두 곳에 다른 번호를 받으면 어느 쪽을 저장할지
//    정할 수 없기 때문이다. 조립 단계에서 두 컨트롤이 같은 values.phone 을 바라보게 두면
//    1번에서 입력한 번호로 5번에서 그대로 인증할 수 있다. 시안이 같은 값을 두 번 묻는
//    구조인지(중복 결함)는 명세 미해결 항목이다.

import {
  FORM_SECTIONS,
  GENDER_OPTIONS,
  MENTOR_REGION_OPTIONS,
} from "@/data/mentorApply";
import { isValidMobile } from "@/lib/phoneVerification";
import { isValidBirthDate, isValidEmail } from "@/lib/validators";
import ChipGroup from "./ChipGroup";
import FormFieldRow from "./FormFieldRow";
import FormSectionCard from "./FormSectionCard";
import MentorTextField, { MentorFieldShell } from "./MentorTextField";

// 사이드바(§6-3)가 앵커로 점프할 타깃. 5개 섹션이 같은 규칙으로 id 를 만든다.
export const APPLICANT_SECTION_ID = "mentor-form-section-1";

// 이 섹션이 소유하는 필드 name 목록(진행률 사이드바용). 화면에 그려진 순서 그대로다.
// `gender` 는 QA 지시(2026-08-21)로 추가한 필드다 — DB 컬럼·서버 화이트리스트까지 배선
// 완료(src/data/mentorApply.ts GENDER_OPTIONS 주석 참고).
export const APPLICANT_FIELDS = [
  "name",
  "birth_date",
  "gender",
  "phone",
  "email",
  "residence_region",
];

// 필수 필드 — 섹션 1 은 6개 전부 필수다(원 명세는 5개였으나 gender 추가로 6개가 됐다).
export const APPLICANT_REQUIRED_FIELDS = APPLICANT_FIELDS;

// ⚠ [시안 부재 — 파생 카피] 에러 상태 자체가 시안에 없다(명세 §6-6: Status/Error 변수만 정의되고
//    폼 어디에도 미사용, 확인 항목 ㉕). 아래 문구는 저장소의 기존 검증 문구 어투
//    (src/lib/phoneVerification.js MESSAGES)를 따라 지은 잠정값이다. 확정 문구가 내려오면
//    이 상수 한 곳만 고치면 된다.
const ERROR_MESSAGES = {
  name: "이름을 입력해 주세요.",
  gender: "성별을 선택해 주세요.",
  birth_date_required: "생년월일을 입력해 주세요.",
  birth_date_format: "생년월일을 숫자 8자리로 정확히 입력해 주세요.",
  phone_required: "휴대폰 번호를 입력해 주세요.",
  phone_format: "휴대폰 번호 형식이 올바르지 않습니다.",
  email_required: "이메일을 입력해 주세요.",
  email_format: "이메일 형식이 올바르지 않습니다.",
  residence_region: "거주 지역을 선택해 주세요.",
};

// 섹션 단위 검증. 조립부(MentorApply.jsx)가 제출 시점에 5개 섹션의 검증 결과를 합쳐
// errors 맵을 만든다. 필드별 규칙을 필드 정의 바로 옆에 두려고 컴포넌트와 같은 파일에 뒀다.
// 반환값은 `{ [name]: message }` — 통과한 필드는 키 자체가 없다.
type ApplicantValues = Record<string, string | undefined>;

export function validateApplicantSection(values: ApplicantValues = {}) {
  const errors: Record<string, string> = {};
  const trimmed = (key: string) => String(values[key] ?? "").trim();

  if (!trimmed("name")) errors.name = ERROR_MESSAGES.name;

  if (!trimmed("gender")) errors.gender = ERROR_MESSAGES.gender;

  if (!trimmed("birth_date"))
    errors.birth_date = ERROR_MESSAGES.birth_date_required;
  else if (!isValidBirthDate(values.birth_date))
    errors.birth_date = ERROR_MESSAGES.birth_date_format;

  if (!trimmed("phone")) errors.phone = ERROR_MESSAGES.phone_required;
  else if (!isValidMobile(values.phone))
    errors.phone = ERROR_MESSAGES.phone_format;

  if (!trimmed("email")) errors.email = ERROR_MESSAGES.email_required;
  // trimmed("email")이 truthy이므로 email은 정의됨
  else if (!isValidEmail(values.email!))
    errors.email = ERROR_MESSAGES.email_format;

  if (!trimmed("residence_region"))
    errors.residence_region = ERROR_MESSAGES.residence_region;

  return errors;
}

const SECTION = FORM_SECTIONS[0]!; // FORM_SECTIONS는 5개 섹션 고정 배열, 0번 인덱스 항상 존재

type FormSectionApplicantProps = {
  values?: ApplicantValues;
  errors?: Record<string, string | undefined>; // MentorApplyForm의 errors 상태와 동일한 형태(값 지웠을 때 undefined)
  onChange?: (name: string, value: string) => void;
};

export default function FormSectionApplicant({
  values = {},
  errors = {},
  onChange,
}: FormSectionApplicantProps) {
  // onChange(name, value) — 저장소 관례의 updateField 시그니처 그대로다.
  const handle = (name) => (value) => onChange?.(name, value);

  return (
    <FormSectionCard
      id={APPLICANT_SECTION_ID}
      no={SECTION.no}
      title={SECTION.title}
      subtitle={SECTION.subtitle}
    >
      {/* 1-1 이름 / 1-2 생년월일 — 2컬럼(368 + 17 + 368) */}
      <FormFieldRow columns={2}>
        <MentorTextField
          name="name"
          label="이름"
          required
          value={values.name ?? ""}
          onChange={handle("name")}
          placeholder="이름을 입력 해주세요"
          autoComplete="name"
          // 서버 상한(api/_routes/mentor-apply.js FIELD_SPECS)과 동일하게 맞춰 둔다. 클라에서 넘길 수
          // 없는 값이면 서버가 거절할 일도 없다.
          maxLength={50}
          error={errors.name}
        />
        <MentorTextField
          name="birth_date"
          label="생년월일"
          required
          value={values.birth_date ?? ""}
          onChange={handle("birth_date")}
          // 시안 원문 그대로 — 예시 날짜와 자릿수 안내가 한 문자열이다.
          placeholder="20040214 (숫자 8자리)"
          // 달력 위젯이 아니라 8자리 숫자 입력이다(DB 도 text, sql/52 L65). type="number" 는
          // 앞자리 0 소실·스피너 때문에 쓰지 않고 text + inputMode 로 모바일 숫자 키패드만 띄운다.
          inputMode="numeric"
          autoComplete="bday"
          maxLength={8}
          error={errors.birth_date}
        />
      </FormFieldRow>

      {/* 성별 — QA 지시(2026-08-21)로 추가. 다른 단일 선택 필드(입시 이력·최종 등록 전형 등)와
          같은 ChipGroup 관행을 따른다. DB 컬럼 부재로 제출 payload 에는 담기지 않는다(파일 상단
          APPLICANT_FIELDS 주석 참고). */}
      <FormFieldRow>
        <MentorFieldShell
          fieldId="mentor-gender"
          label="성별"
          required
          error={errors.gender}
        >
          <ChipGroup
            name="gender"
            ariaLabel="성별"
            options={GENDER_OPTIONS}
            value={values.gender ?? ""}
            onChange={handle("gender")}
          />
        </MentorFieldShell>
      </FormFieldRow>

      {/* 1-3 휴대폰 번호 / 1-4 이메일 — 2컬럼 */}
      <FormFieldRow columns={2}>
        <MentorTextField
          name="phone"
          label="휴대폰 번호"
          required
          type="tel"
          value={values.phone ?? ""}
          onChange={handle("phone")}
          placeholder="010-1234-5678"
          inputMode="tel"
          autoComplete="tel"
          // 하이픈 포함 13자. 정규화(normalizePhone)는 검증·제출 시점에 한다 — 입력 중에
          // 값을 바꾸면 커서가 튄다.
          maxLength={13}
          error={errors.phone}
        />
        <MentorTextField
          name="email"
          label="이메일"
          required
          type="email"
          value={values.email ?? ""}
          onChange={handle("email")}
          placeholder="mentor@example.com"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          error={errors.email}
        />
      </FormFieldRow>

      {/* 1-5 거주 지역 — 칩 라디오 6개, full(753) */}
      <FormFieldRow>
        {/* 칩 그룹은 <input> 이 아니라 role="radiogroup" 이라 <label htmlFor> 로 묶을 수 없다.
            라벨/도움말/에러 슬롯 골격만 MentorFieldShell 에서 받고(다른 필드와 세로 리듬을
            맞추기 위해 반드시 같은 셸을 써야 한다), 실제 접근성 라벨은 ChipGroup 의
            aria-label 로 전달한다. 셸이 그리는 <label> 의 htmlFor 는 이 경우 대상이 없다 —
            MentorFieldShell 이 라벨에 id 를 달아주면 aria-labelledby 로 정식 연결할 수 있다. */}
        <MentorFieldShell
          fieldId="mentor-residence-region"
          label="거주 지역"
          required
          helperText="비대면 상담이므로 배정에는 영향이 없습니다. 통계 목적으로만 수집합니다."
          error={errors.residence_region}
        >
          <ChipGroup
            name="residence_region"
            ariaLabel="거주 지역"
            options={MENTOR_REGION_OPTIONS}
            value={values.residence_region ?? ""}
            onChange={handle("residence_region")}
          />
        </MentorFieldShell>
      </FormFieldRow>
    </FormSectionCard>
  );
}
