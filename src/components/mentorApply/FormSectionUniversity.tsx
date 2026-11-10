// 멘토 지원서 폼 — 2. 대학 및 합격 전형 (3372:4060) / docs/mentor-apply-spec.md §폼 명세 섹션 2.
//
// 파일을 섹션 단위로 쪼갠 이유와 제어 컴포넌트 규약은 FormSectionApplicant.jsx 상단 주석 참고.
// 필드 name 은 DB 컬럼명(sql/52_mentor_applications.sql) / 제출 API 본문 키와 동일하다.
//
// 셀렉트만 auth/SelectField 를 그대로 쓴다(명세 §재사용 매핑 A — 수정 0 확정).
// 다만 SelectField 는 자체 라벨을 14px 로 그리고 필수 `*` 표시가 없어서, 시안 §6-6 의
// 라벨 규격(Medium 16 / `#525252` / `*` 는 accent)과 어긋난다. 그래서 **SelectField 에는
// label 을 넘기지 않고** MentorFieldShell 로 감싼다 — 셸의 <label htmlFor> 가 SelectField 에
// 넘긴 id 를 그대로 가리키므로 라벨 클릭·스크린리더 연결이 정상 동작하고, 같은 카드 안의
// 인풋·텍스트에어리어와 라벨 위치·gap·에러 슬롯 높이가 정확히 일치한다.

import SelectField from "@/components/auth/SelectField";
import {
  ADMISSION_HISTORY_OPTIONS,
  ENROLLMENT_STATUS_OPTIONS,
  FINAL_TRACK_OPTIONS,
  FORM_SECTIONS,
} from "@/data/mentorApply";
import { isValidAdmissionYear, isWithinMaxLength } from "@/lib/validators";
import ChipGroup from "./ChipGroup";
import FormFieldRow from "./FormFieldRow";
import FormSectionCard from "./FormSectionCard";
import MentorTextField, { MentorFieldShell } from "./MentorTextField";
import TextareaField from "./TextareaField";

export const UNIVERSITY_SECTION_ID = "mentor-form-section-2";

export const UNIVERSITY_FIELDS = [
  "university",
  "major",
  "admission_year",
  "enrollment_status",
  "admission_history",
  "final_admission_track",
  "exam_results",
];

// 섹션 2 는 7개 전부 필수다(명세 §폼 명세 필수 항목 카운트: 필수 7 / 선택 0).
export const UNIVERSITY_REQUIRED_FIELDS = UNIVERSITY_FIELDS;

// 2-7 응시 정보와 결과 전체 — 서버(api/_routes/mentor-apply.js)·명세와 동일한 상한.
const EXAM_RESULTS_MAX_LENGTH = 2000;

// ⚠ [시안 부재 — 파생 카피] FormSectionApplicant.jsx 의 ERROR_MESSAGES 주석과 동일한 사정이다.
const ERROR_MESSAGES = {
  university: "대학교를 입력해 주세요.",
  major: "학과·학부를 입력해 주세요.",
  admission_year_required: "입학년도를 입력해 주세요.",
  admission_year_format: "입학년도를 4자리 연도로 정확히 입력해 주세요.",
  enrollment_status: "재학 상태를 선택해 주세요.",
  admission_history: "입시 이력을 선택해 주세요.",
  final_admission_track: "최종 등록한 합격 전형을 선택해 주세요.",
  exam_results_required: "응시 정보와 결과를 입력해 주세요.",
  exam_results_length: `${EXAM_RESULTS_MAX_LENGTH}자 이내로 입력해 주세요.`,
};

type UniversityValues = Record<string, string | undefined>;

export function validateUniversitySection(values: UniversityValues = {}) {
  const errors: Record<string, string> = {};
  const trimmed = (key: string) => String(values[key] ?? "").trim();

  if (!trimmed("university")) errors.university = ERROR_MESSAGES.university;
  if (!trimmed("major")) errors.major = ERROR_MESSAGES.major;

  if (!trimmed("admission_year"))
    errors.admission_year = ERROR_MESSAGES.admission_year_required;
  else if (!isValidAdmissionYear(values.admission_year)) {
    errors.admission_year = ERROR_MESSAGES.admission_year_format;
  }

  if (!trimmed("enrollment_status"))
    errors.enrollment_status = ERROR_MESSAGES.enrollment_status;
  if (!trimmed("admission_history"))
    errors.admission_history = ERROR_MESSAGES.admission_history;
  if (!trimmed("final_admission_track")) {
    errors.final_admission_track = ERROR_MESSAGES.final_admission_track;
  }

  if (!trimmed("exam_results"))
    errors.exam_results = ERROR_MESSAGES.exam_results_required;
  else if (!isWithinMaxLength(values.exam_results, EXAM_RESULTS_MAX_LENGTH)) {
    errors.exam_results = ERROR_MESSAGES.exam_results_length;
  }

  return errors;
}

// 2-7 placeholder — 시안 원문 그대로다. 빈 줄, 번호 앞 공백 1칸(Figma <ol> 마커 들여쓰기),
// 항목별 ` / ` 구분자를 임의로 정리하지 마라.
const EXAM_RESULTS_PLACEHOLDER = `형식) 대학 / 모집단위 / 전형 / 결과 (2000자 이내)

예)
 1. 부산대학교 / 경영학과 / 수시 학생부종합 / 최초합
 2. 연세대학교 / 경영학과 / 수시 논술 / 불합
 3. 중앙대학교 / 경영학부 / 정시 가군 / 추가합격 (3순위)`;

const SECTION = FORM_SECTIONS[1]!; // FORM_SECTIONS는 5개 섹션 고정 배열, 1번 인덱스 항상 존재

type FormSectionUniversityProps = {
  values?: UniversityValues;
  errors?: Record<string, string | undefined>; // MentorApplyForm의 errors 상태와 동일한 형태(값 지웠을 때 undefined)
  onChange?: (name: string, value: string) => void;
};

export default function FormSectionUniversity({
  values = {},
  errors = {},
  onChange,
}: FormSectionUniversityProps) {
  const handle = (name: string) => (value: string) => onChange?.(name, value);

  return (
    <FormSectionCard
      id={UNIVERSITY_SECTION_ID}
      no={SECTION.no}
      title={SECTION.title}
      subtitle={SECTION.subtitle}
    >
      {/* 2-1 대학교 / 2-2 학과·학부 — 2컬럼 */}
      <FormFieldRow columns={2}>
        <MentorTextField
          name="university"
          label="대학교"
          required
          helperText="약칭이 아닌 정식 명칭으로 입력해주세요."
          value={values.university ?? ""}
          onChange={handle("university")}
          placeholder="예) 부산대학교"
          maxLength={100}
          error={errors.university}
        />
        <MentorTextField
          name="major"
          label="학과·학부"
          required
          helperText="모집단위 정식 명칭으로 입력해 주세요."
          value={values.major ?? ""}
          onChange={handle("major")}
          placeholder="예) 경영학과"
          maxLength={100}
          error={errors.major}
        />
      </FormFieldRow>

      {/* 2-3 입학년도 / 2-4 재학 상태 — 2컬럼 */}
      <FormFieldRow columns={2}>
        <MentorTextField
          name="admission_year"
          label="입학년도"
          required
          value={values.admission_year ?? ""}
          onChange={handle("admission_year")}
          placeholder="예) 2025"
          inputMode="numeric"
          maxLength={4}
          error={errors.admission_year}
        />

        {/* 라벨은 셸이 그린다(파일 상단 주석). SelectField 에는 id 만 넘겨 <label htmlFor> 와 잇는다.
            ⚠ 시안 라벨 원문은 `재학 상태 * ` 로 끝에 공백이 있으나, `*` 를 required prop 으로
               분리하고 나면 남는 trailing space 는 HTML 이 접어 없애므로 라벨 문자열에서 뺐다. */}
        <MentorFieldShell
          fieldId="enrollment_status"
          label="재학 상태"
          required
          error={errors.enrollment_status}
        >
          <SelectField
            id="enrollment_status"
            name="enrollment_status"
            value={values.enrollment_status ?? ""}
            onChange={handle("enrollment_status")}
            options={ENROLLMENT_STATUS_OPTIONS}
            placeholder="재학 상태 선택"
            required
            // helperText 는 넘기지 않는다 — 넘기면 셸의 에러 슬롯 아래에 두 번째 메시지 줄이
            // 생겨 세로 리듬이 이 필드만 어긋난다. status 는 aria-invalid 전달용.
            status={errors.enrollment_status ? "error" : "default"}
          />
        </MentorFieldShell>
      </FormFieldRow>

      {/* 2-5 입시 이력 / 2-6 최종 등록한 합격 전형 — 2컬럼.
          ⚠ 시안에서 이 행만 363.5 + gap 26 + 363.5 다(다른 2컬럼 행은 368 + 17 + 368).
             FormFieldRow 가 17 로 통일해 두었으므로 여기서 별도 처리하지 않는다(명세 §6-10 #3). */}
      <FormFieldRow columns={2}>
        <MentorFieldShell
          fieldId="mentor-admission-history"
          label="입시 이력"
          required
          error={errors.admission_history}
        >
          <ChipGroup
            name="admission_history"
            ariaLabel="입시 이력"
            options={ADMISSION_HISTORY_OPTIONS}
            value={values.admission_history ?? ""}
            onChange={handle("admission_history")}
          />
        </MentorFieldShell>

        <MentorFieldShell
          fieldId="mentor-final-admission-track"
          label="최종 등록한 합격 전형"
          required
          error={errors.final_admission_track}
        >
          <ChipGroup
            name="final_admission_track"
            ariaLabel="최종 등록한 합격 전형"
            options={FINAL_TRACK_OPTIONS}
            value={values.final_admission_track ?? ""}
            onChange={handle("final_admission_track")}
          />
        </MentorFieldShell>
      </FormFieldRow>

      {/* 2-7 응시 정보와 결과 전체 — full(753), textarea h=172 */}
      <FormFieldRow>
        <TextareaField
          name="exam_results"
          label="응시 정보와 결과 전체"
          required
          helperText={
            <>
              {"지원한 모든 대학의 결과를 합격·불합격 구분 없이 적어 주세요. "}
              <span className="text-accent">
                불합격 이력도 후배에게는 중요한 정보
              </span>
              입니다.
            </>
          }
          value={values.exam_results ?? ""}
          onChange={handle("exam_results")}
          placeholder={EXAM_RESULTS_PLACEHOLDER}
          // 시안 높이 172 = 상하 패딩 40 + 본문 132. 16px × lh 1.4 = 22.4px 이므로 약 6줄.
          rows={6}
          maxLength={EXAM_RESULTS_MAX_LENGTH}
          error={errors.exam_results}
          // 글자수 카운터 노출 통일(리뷰 WARN #5) — 섹션 4 텍스트에어리어 6개는 이미
          // showCounter 를 켰는데 이 필드만 꺼져 있어 같은 폼 안에서 필드마다 다르게
          // 보였다. 상한이 있는 textarea 는 카운터가 사용자에게 명백히 유용하므로 폼
          // 전체를 켜는 쪽으로 통일한다. 카운터 노출 자체는 명세 확인 항목 ㉝ 이 아직
          // 미확정이라(TextareaField.jsx 파일 상단 주석) 확정되면 이 필드를 포함해 폼
          // 전체 showCounter 를 한 번에 껐다 켰다 해야 한다.
          showCounter
        />
      </FormFieldRow>
    </FormSectionCard>
  );
}
