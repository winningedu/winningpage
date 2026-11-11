// 멘토 지원서 폼 섹션 4 「멘토 역량」 — docs/mentor-apply-spec.md § 폼 명세 섹션 4 / §6-4 ~ §6-6.
//
// 상태를 소유하지 않는 **제어 컴포넌트**다. 값·에러·변경 콜백을 전부 부모(조립 페이지)가 들고
// 있어야 작성 현황 사이드바(§6-3)가 27개 필수 필드의 채움 상태를 한 곳에서 셀 수 있고,
// 제출 페이로드도 섹션별로 흩어지지 않는다(명세 §6-3 / §백엔드·데이터).
//
// 필드 name 은 DB 컬럼(sql/52_mentor_applications.sql) 및 제출 엔드포인트(api/_routes/mentor-apply.js)의
// 키와 **문자 그대로 동일한 snake_case** 로 맞췄다. 화면용 camelCase 를 따로 두면 제출 직전에
// 매핑 테이블이 하나 더 생기고, 그 테이블이 곧 오타의 발원지가 된다.
//
// ⚠ 시안 대비 의도적 판단 3건 (전부 명세 확인 항목과 연결):
//   ① 4-3 `상담 가능 학년` 은 시안에 단일/복수 구분이 없다(확인 항목 ㉒). 지시 + DB 스키마
//      (`consult_grades text[]`)에 따라 **복수 선택**으로 구현했다 — 추정이며 확정 필요.
//   ② 4-8 `효과가 없었던 방법 한 가지` 는 시안에 2회 나오지만(3386:4505 / 3386:4513) 라벨·
//      설명·placeholder 가 완전히 같은 **복제 실수로 확정**됐다(확인 항목 ⑳). 1개만 만든다.
//   ③ 텍스트에어리어에 `maxLength` + `showCounter` 를 켰다. 아래 MAX_LENGTHS 주석 참고.
import type { ReactNode } from "react";
import SelectField from "@/components/auth/SelectField";
import {
  AVAILABLE_TIMESLOT_OPTIONS,
  CONSULT_FIELD_OPTIONS,
  CONSULT_GRADE_OPTIONS,
  FORM_SECTIONS,
  WEEKLY_CAPACITY_OPTIONS,
} from "@/data/mentorApply";
import ChipGroup from "./ChipGroup";
import FormFieldRow from "./FormFieldRow";
import FormSectionCard from "./FormSectionCard";
import { MentorFieldShell } from "./MentorTextField";
import TextareaField from "./TextareaField";

const SECTION = FORM_SECTIONS.find((section) => section.no === 4)!; // FORM_SECTIONS에 no===4 항목 항상 존재

// 사이드바 앵커 기본값(§6-3). 부모가 다른 id 체계를 쓰면 prop 으로 덮는다.
export const COMPETENCY_SECTION_ID = "mentor-apply-section-4";

// 부모가 초기 상태·검증·진행률 계산에 쓸 수 있도록 이 섹션이 소유하는 필드를 그대로 노출한다.
// 순서는 시안 4-1 ~ 4-10 순서와 동일하다.
export const COMPETENCY_FIELD_NAMES = [
  "consult_fields",
  "strongest_field_reason",
  "consult_grades",
  "weekly_capacity",
  "available_timeslot",
  "motivation",
  "strengths",
  "ineffective_method",
  "situation_answer",
  "tutoring_experience",
];

// 4-10 `과외·멘토링 경험` 만 선택 항목이다(§폼 명세 섹션 4 표 — 필수 9 / 선택 1).
export const COMPETENCY_REQUIRED_FIELD_NAMES = COMPETENCY_FIELD_NAMES.filter(
  (name) => name !== "tutoring_experience",
);

// 값이 배열인 필드 — 부모가 초기값을 `[]` 로 잡아야 하는 필드를 헷갈리지 않게 명시한다.
export const COMPETENCY_MULTI_FIELD_NAMES = [
  "consult_fields",
  "consult_grades",
];

// 글자수 상한(§폼 명세 섹션 4 검증규칙). 서버(api/_routes/mentor-apply.js)와 동일한 값이다.
//
// ⚠ 이 값을 `maxLength` 로 컨트롤에 직접 걸고 `showCounter` 도 함께 켰다. 시안은 상한을
//    placeholder 안 `(600자 이내)` 문구로만 알리고 카운터를 그리지 않았으므로(확인 항목 ㉝)
//    카운터 노출은 **시안 파생**이다. 그럼에도 켠 이유는, maxLength 만 걸면 상한을 넘긴
//    타이핑·붙여넣기가 **아무 안내 없이 잘려나가** 사용자가 잘린 사실조차 모른 채 제출하기
//    때문이다. 카운터 없이 잘라내지 않으려면 maxLength 를 빼고 부모가 제출 시점에 에러를
//    띄워야 하는데, 1000자짜리 답변을 다 쓴 뒤 거절당하는 쪽이 더 나쁘다.
//    카운터 미노출로 확정되면 아래 `showCounter` 를 끄고 maxLength 도 함께 빼야 한다.
export const COMPETENCY_MAX_LENGTHS = {
  strongest_field_reason: 600,
  motivation: 1000,
  strengths: 1000,
  ineffective_method: 600,
  situation_answer: 800,
  tutoring_experience: 500,
};

// 셀렉트 placeholder 원문(§폼 명세 4-4 / 4-5).
const SELECT_PLACEHOLDER = "선택";

// placeholder 는 시안 원문 그대로 옮긴다 — 줄바꿈·번호·연속 공백까지 보존한다.
// (4-10 의 `개인과외` 와 `(500자 이내)` 사이 공백 2칸도 원문이다.)
const PLACEHOLDER = {
  strongest_field_reason:
    "예) 계획·시간관리 - 고2 1학기까지 계획을 세워도 절반도 못 지켰는데, 무엇을 바꿔서 어떻게 달라졌는지\n(600자 이내)",
  motivation:
    "고등학교 시절 어떤 도움이 필요했는지, 지금 어떤 도움을 줄 수 있다고 생각하는지 중심으로 적어주세요.\n(1000자 이내)",
  strengths:
    "1. 고2 1학기 수학 5등급에서 고3 1학기 2등급까지 올린 과정과 그때 실제로 바꾼 공부 순서\n2. ...\n3. ...\n\n(1000자 이내)",
  ineffective_method:
    "어떤 방법이었는지, 왜 효과가 없었다고 생각하는지 적어주세요. (600자 이내)",
  situation_answer:
    "정답은 없습니다. 본인이라면 어떤 순서로 접근할지 솔직하게 적어주세요. (800자 이내)",
  tutoring_experience:
    "예) 2025.03~2025.12 / 고1 / 수학·영어 개인과외  (500자 이내)",
};

// 도움말 내 강조는 시안에서 `#0B84FD`(accent) 동일 크기 인라인 스팬이다(§6-6).
function Accent({ children }: { children?: ReactNode }) {
  return <span className="text-accent">{children}</span>;
}

// 시안 텍스트에어리어 고정 높이(128 / 150 / 172)를 rows 로 근사한 값.
// 16px × lh1.4 = 22.4px/행 + 상하 패딩 40px 기준 → 150≈5행, 172≈6행.
const ROWS = {
  default: 5,
  strengths: 6,
};

// 값이 배열(칩 복수선택 2종)/문자열(그 외)로 갈리는 필드 이름이 섞여 있다.
type CompetencyValues = {
  consult_fields?: string[];
  strongest_field_reason?: string;
  consult_grades?: string[];
  weekly_capacity?: string;
  available_timeslot?: string;
  motivation?: string;
  strengths?: string;
  ineffective_method?: string;
  situation_answer?: string;
  tutoring_experience?: string;
};

type FormSectionCompetencyProps = {
  values?: CompetencyValues;
  errors?: Record<string, string | undefined>; // MentorApplyForm의 errors 상태와 동일한 형태(값 지웠을 때 undefined)
  onChange?: (name: string, value: string | string[]) => void;
  id?: string;
};

export default function FormSectionCompetency({
  values = {},
  errors = {},
  onChange, // (name, value) => void
  id = COMPETENCY_SECTION_ID,
}: FormSectionCompetencyProps) {
  const handle = (name: string) => (value: string | string[]) =>
    onChange?.(name, value);

  return (
    <FormSectionCard
      no={SECTION.no}
      title={SECTION.title}
      subtitle={SECTION.subtitle}
      id={id}
    >
      {/* 4-1 상담 가능 분야 — 복수 선택 6종.
          ⚠ §4 상담 분야 카드 7종(COUNSEL_FIELDS)과 개수·표기가 다르지만 DB(consult_fields)에
             저장되는 정본은 폼 6종이다 — mentorApply.js CONSULT_FIELD_OPTIONS 주석 참고. */}
      <MentorFieldShell
        fieldId="mentor-apply-consult-fields"
        label="상담 가능 분야"
        required
        error={errors.consult_fields}
      >
        <ChipGroup
          name="consult_fields"
          options={CONSULT_FIELD_OPTIONS}
          value={values.consult_fields}
          onChange={handle("consult_fields")}
          multiple
          // 칩 그룹은 <label htmlFor> 로 이름을 받을 수 없어(대상이 단일 컨트롤이 아니다)
          // 그룹 자체에 접근 이름을 직접 준다. 리포트 needsOtherFile 참고.
          ariaLabel="상담 가능 분야"
        />
      </MentorFieldShell>

      {/* 4-2 가장 자신 있는 분야와 그 근거 */}
      <TextareaField
        name="strongest_field_reason"
        label="가장 자신 있는 분야와 그 근거"
        required
        helperText={
          <>
            위에서 고른 분야 중 하나를 골라,{" "}
            <Accent>본인이 직접 겪은 경험</Accent>을 근거로 설명해주세요.
          </>
        }
        value={values.strongest_field_reason ?? ""}
        onChange={handle("strongest_field_reason")}
        placeholder={PLACEHOLDER.strongest_field_reason}
        error={errors.strongest_field_reason}
        rows={ROWS.default}
        maxLength={COMPETENCY_MAX_LENGTHS.strongest_field_reason}
        showCounter
      />

      {/* 4-3 상담 가능 학년 — 복수 선택(추정, 확인 항목 ㉒). 파일 상단 주석 ① 참고. */}
      <MentorFieldShell
        fieldId="mentor-apply-consult-grades"
        label="상담 가능 학년"
        required
        error={errors.consult_grades}
      >
        <ChipGroup
          name="consult_grades"
          options={CONSULT_GRADE_OPTIONS}
          value={values.consult_grades}
          onChange={handle("consult_grades")}
          multiple
          ariaLabel="상담 가능 학년"
        />
      </MentorFieldShell>

      {/* 4-4 / 4-5 — 시안 표에서 두 필드만 `full` 표기가 없는 셀렉트라 2컬럼 행으로 묶었다
          (§폼 명세 섹션 4 표. 나머지 4-1~4-3·4-6~4-10 은 전부 full 명시). */}
      <FormFieldRow columns={2}>
        <MentorFieldShell
          fieldId="mentor-apply-weekly-capacity"
          label="주당 상담 가능 횟수"
          required
          error={errors.weekly_capacity}
        >
          {/* auth/SelectField 를 그대로 쓰되 label 은 넘기지 않는다 — SelectField 의 라벨은
              14px(로그인·회원가입 계약)이고 이 폼의 라벨은 16px Medium(§6-6)이라 규격이 다르다.
              라벨·에러 슬롯은 MentorFieldShell 이 책임지고 SelectField 는 컨트롤만 그린다. */}
          <SelectField
            id="mentor-apply-weekly-capacity"
            name="weekly_capacity"
            value={values.weekly_capacity ?? ""}
            onChange={handle("weekly_capacity")}
            options={WEEKLY_CAPACITY_OPTIONS}
            placeholder={SELECT_PLACEHOLDER}
            required
            // helperText 를 넘기지 않으면 SelectField 는 아무 노드도 더 그리지 않고
            // aria-invalid 만 켠다(에러 문구는 위 shell 의 고정 슬롯이 담당).
            status={errors.weekly_capacity ? "error" : "default"}
          />
        </MentorFieldShell>

        <MentorFieldShell
          fieldId="mentor-apply-available-timeslot"
          label="상담 가능 시간대"
          required
          error={errors.available_timeslot}
        >
          <SelectField
            id="mentor-apply-available-timeslot"
            name="available_timeslot"
            value={values.available_timeslot ?? ""}
            onChange={handle("available_timeslot")}
            options={AVAILABLE_TIMESLOT_OPTIONS}
            placeholder={SELECT_PLACEHOLDER}
            required
            status={errors.available_timeslot ? "error" : "default"}
          />
        </MentorFieldShell>
      </FormFieldRow>

      {/* 4-6 지원 동기 */}
      <TextareaField
        name="motivation"
        label="지원 동기"
        required
        helperText="위닝 콜멘토 멘토로 지원한 이유를 적어 주세요."
        value={values.motivation ?? ""}
        onChange={handle("motivation")}
        placeholder={PLACEHOLDER.motivation}
        error={errors.motivation}
        rows={ROWS.default}
        maxLength={COMPETENCY_MAX_LENGTHS.motivation}
        showCounter
      />

      {/* 4-7 멘토로서의 강점 3가지 — 시안 h=172 라 유일하게 6행이다. */}
      <TextareaField
        name="strengths"
        label="멘토로서의 강점 3가지"
        required
        helperText={
          <>
            성격이나 태도보다 <Accent>실제 경험과 결과</Accent>로 설명해주세요.
            번호를 붙여 세 가지로 나누어 작성합니다.{" "}
          </>
        }
        value={values.strengths ?? ""}
        onChange={handle("strengths")}
        placeholder={PLACEHOLDER.strengths}
        error={errors.strengths}
        rows={ROWS.strengths}
        maxLength={COMPETENCY_MAX_LENGTHS.strengths}
        showCounter
      />

      {/* 4-8 효과가 없었던 방법 한 가지 — 시안 중복 2건 중 1개만 구현(파일 상단 주석 ②). */}
      <TextareaField
        name="ineffective_method"
        label="효과가 없었던 방법 한 가지"
        required
        helperText={
          <>
            본인이 입시 준비 중 시도했지만 <Accent>효과가 없었던 방법</Accent>과
            그 이유를 적어 주세요. 성공 경험만큼 중요한 정보입니다.
          </>
        }
        value={values.ineffective_method ?? ""}
        onChange={handle("ineffective_method")}
        placeholder={PLACEHOLDER.ineffective_method}
        error={errors.ineffective_method}
        rows={ROWS.default}
        maxLength={COMPETENCY_MAX_LENGTHS.ineffective_method}
        showCounter
      />

      {/* 4-9 상황 질문 — 도움말이 2줄이다. 1줄의 따옴표는 여는 U+201C / 닫는 U+0022 로
          비대칭인데 시안 원문 그대로다(§폼 명세 4-9 ⚠ 표기). 임의 교정하지 않는다. */}
      <TextareaField
        name="situation_answer"
        label="상황 질문"
        required
        helperText={
          <>
            상황 - 고2 학생이 “계획은 매일 세우는데 집중력이 없어서 못 지킨다"고
            말합니다.
            <br />
            상담을 시작하면서 <Accent>무엇을 먼저 확인하시겠습니까?</Accent>{" "}
            확인할 내용과 그 이유를 적어주세요.
          </>
        }
        value={values.situation_answer ?? ""}
        onChange={handle("situation_answer")}
        placeholder={PLACEHOLDER.situation_answer}
        error={errors.situation_answer}
        rows={ROWS.default}
        maxLength={COMPETENCY_MAX_LENGTHS.situation_answer}
        showCounter
      />

      {/* 4-10 과외·멘토링 경험 — 이 섹션의 유일한 선택 항목이다. */}
      <TextareaField
        name="tutoring_experience"
        label="과외·멘토링 경험"
        helperText="기간, 대상 학년, 담당 과목 순으로 적어주세요. 경험이 없어도 지원할 수 있습니다. "
        value={values.tutoring_experience ?? ""}
        onChange={handle("tutoring_experience")}
        placeholder={PLACEHOLDER.tutoring_experience}
        error={errors.tutoring_experience}
        rows={ROWS.default}
        maxLength={COMPETENCY_MAX_LENGTHS.tutoring_experience}
        showCounter
      />
    </FormSectionCard>
  );
}
