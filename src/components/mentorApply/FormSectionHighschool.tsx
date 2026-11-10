// 멘토 지원서 폼 — 3. 출신 고등학교 (3375:4163) / docs/mentor-apply-spec.md §폼 명세 섹션 3.
//
// 파일을 섹션 단위로 쪼갠 이유와 제어 컴포넌트 규약은 FormSectionApplicant.jsx 상단 주석 참고.
// 필드 name 은 DB 컬럼명(sql/52_mentor_applications.sql) / 제출 API 본문 키와 동일하다.
//
// 이 섹션에만 **선택 필드가 2개**(3-4 내신 평균 / 3-5 수능 성적 요약) 있다. 시안은 선택 필드의
// 라벨을 필수 필드와 다르게 그렸다고 기록돼 있으나 색 값 자체가 명세에 없다 — 필수 표시 `*`
// (accent #0B84FD)의 유무가 그대로 그 차이라고 보고 `required` 를 빼는 것으로만 구현했다.
// 별도 라벨 색이 확정되면 MentorFieldShell 에 optional 표기 슬롯을 여는 쪽이 맞다.

import { FORM_SECTIONS, HIGHSCHOOL_TYPE_OPTIONS } from "@/data/mentorApply";
import { isWithinMaxLength } from "@/lib/validators";
import ChipGroup from "./ChipGroup";
import FormFieldRow from "./FormFieldRow";
import FormSectionCard from "./FormSectionCard";
import MentorTextField, { MentorFieldShell } from "./MentorTextField";

export const HIGHSCHOOL_SECTION_ID = "mentor-form-section-3";

export const HIGHSCHOOL_FIELDS = [
  "highschool_region",
  "highschool_name",
  "highschool_type",
  "gpa_average",
  "csat_summary",
];

// 명세 §폼 명세 필수 항목 카운트: 필수 3 / 선택 2. 선택 2개는 진행률·잔여 카운터에서 빼야 한다.
export const HIGHSCHOOL_REQUIRED_FIELDS = [
  "highschool_region",
  "highschool_name",
  "highschool_type",
];

const CSAT_SUMMARY_MAX_LENGTH = 200;

// 내신 평균 — 서버(api/_routes/mentor-apply.js)가 0~9.99 숫자로 받고 소수 2자리로 반올림한다.
// 한 자리 정수 + 소수점 이하 최대 2자리만 허용해 "1.87" 같은 입력만 통과시킨다.
const GPA_PATTERN = /^[0-9](\.[0-9]{1,2})?$/;

// ⚠ [시안 부재 — 파생 카피] FormSectionApplicant.jsx 의 ERROR_MESSAGES 주석과 동일한 사정이다.
const ERROR_MESSAGES = {
  highschool_region: "고등학교 소재 지역을 입력해 주세요.",
  highschool_name: "고등학교명을 입력해 주세요.",
  highschool_type: "고등학교 유형을 선택해 주세요.",
  gpa_average_format: "내신 평균을 예) 1.87 형식으로 입력해 주세요.",
  csat_summary_length: `${CSAT_SUMMARY_MAX_LENGTH}자 이내로 입력해 주세요.`,
};

type HighschoolValues = Record<string, string | undefined>;

export function validateHighschoolSection(values: HighschoolValues = {}) {
  const errors: Record<string, string> = {};
  const trimmed = (key: string) => String(values[key] ?? "").trim();

  if (!trimmed("highschool_region"))
    errors.highschool_region = ERROR_MESSAGES.highschool_region;
  if (!trimmed("highschool_name"))
    errors.highschool_name = ERROR_MESSAGES.highschool_name;
  if (!trimmed("highschool_type"))
    errors.highschool_type = ERROR_MESSAGES.highschool_type;

  // 선택 필드는 "비어 있으면 통과, 채웠으면 형식을 본다".
  if (trimmed("gpa_average") && !GPA_PATTERN.test(trimmed("gpa_average"))) {
    errors.gpa_average = ERROR_MESSAGES.gpa_average_format;
  }
  if (!isWithinMaxLength(values.csat_summary, CSAT_SUMMARY_MAX_LENGTH)) {
    errors.csat_summary = ERROR_MESSAGES.csat_summary_length;
  }

  return errors;
}

const SECTION = FORM_SECTIONS[2]!; // FORM_SECTIONS는 5개 섹션 고정 배열, 2번 인덱스 항상 존재

type FormSectionHighschoolProps = {
  values?: HighschoolValues;
  errors?: Record<string, string | undefined>; // MentorApplyForm의 errors 상태와 동일한 형태(값 지웠을 때 undefined)
  onChange?: (name: string, value: string) => void;
};

export default function FormSectionHighschool({
  values = {},
  errors = {},
  onChange,
}: FormSectionHighschoolProps) {
  const handle = (name) => (value) => onChange?.(name, value);

  return (
    <FormSectionCard
      id={HIGHSCHOOL_SECTION_ID}
      no={SECTION.no}
      title={SECTION.title}
      subtitle={SECTION.subtitle}
    >
      {/* 3-1 고등학교 소재 지역 / 3-2 고등학교명 — 2컬럼 */}
      <FormFieldRow columns={2}>
        <MentorTextField
          name="highschool_region"
          label="고등학교 소재 지역"
          required
          value={values.highschool_region ?? ""}
          onChange={handle("highschool_region")}
          placeholder="예) 부산광역시 북구"
          maxLength={100}
          error={errors.highschool_region}
        />
        <MentorTextField
          name="highschool_name"
          label="고등학교명"
          required
          value={values.highschool_name ?? ""}
          onChange={handle("highschool_name")}
          placeholder="예) 화명고등학교"
          maxLength={100}
          error={errors.highschool_name}
        />
      </FormFieldRow>

      {/* 3-3 고등학교 유형 — 칩 12개, full(753). 시안은 7 + 5 로 2줄 랩되지만 줄 나눔을
          강제하지 않는다(칩 폭이 폰트에 따라 달라지고, 좁은 화면에서는 더 많은 줄이 필요하다).
          ⚠ 단일/복수 선택 여부가 시안에 없다(명세 확인 항목 ㉒). DB 컬럼 highschool_type 이
             text[] 가 아니라 text 단일이므로(sql/52 L82) **단일 선택으로 구현**했다 — 추정이다.
             복수로 확정되면 multiple 을 켜고 DB 컬럼 타입도 함께 바꿔야 한다. */}
      <FormFieldRow>
        <MentorFieldShell
          fieldId="mentor-highschool-type"
          label="고등학교 유형"
          required
          error={errors.highschool_type}
        >
          <ChipGroup
            name="highschool_type"
            ariaLabel="고등학교 유형"
            options={HIGHSCHOOL_TYPE_OPTIONS}
            value={values.highschool_type ?? ""}
            onChange={handle("highschool_type")}
          />
        </MentorFieldShell>
      </FormFieldRow>

      {/* 3-4 졸업 시 전체 내신 평균 / 3-5 수능 성적 요약 — 둘 다 선택 항목, 2컬럼 */}
      <FormFieldRow columns={2}>
        <MentorTextField
          name="gpa_average"
          label="졸업 시 전체 내신 평균"
          helperText="기재하시면 내신 관리 상담 매칭에 활용됩니다."
          value={values.gpa_average ?? ""}
          onChange={handle("gpa_average")}
          placeholder="예) 1.87"
          // 소수점을 포함하므로 numeric 이 아니라 decimal. type="number" 는 스피너·휠 스크롤로
          // 값이 조용히 바뀌는 사고가 있어 쓰지 않는다.
          inputMode="decimal"
          // "9.99" 4자. 상한을 넘는 입력 자체를 막는다.
          maxLength={4}
          error={errors.gpa_average}
        />
        <MentorTextField
          name="csat_summary"
          label="수능 성적 요약"
          helperText="등급 기준으로 간단히 적어주세요."
          value={values.csat_summary ?? ""}
          onChange={handle("csat_summary")}
          placeholder="예) 국2 수2 영1 탐1/3"
          maxLength={CSAT_SUMMARY_MAX_LENGTH}
          error={errors.csat_summary}
        />
      </FormFieldRow>
    </FormSectionCard>
  );
}
