import type { FormEvent, ReactNode } from "react";
import { useMemo, useState } from "react";
import PrimaryButton from "@/components/auth/PrimaryButton";
import SelectField from "@/components/auth/SelectField";
import TextField from "@/components/auth/TextField";
import {
  getSubjectOptions,
  SUBJECT_GROUPS,
} from "@/data/performanceCurriculum";

// STEP1 기본 정보 입력 폼 — docs/수행평가-상세-명세.md §5.5(`3754:3206`) 단정 전문.
//
// **레이아웃**: 학년·학기 2열(Q10 결정, 시안 없음) → 교과군·과목 2열(교과군 종속) →
// 이전에 한 주제(선택) → 희망 진로 → 안내 패널 → CTA. 필드 스택 gap 1.25rem(§7.3),
// 라벨↔컨트롤 gap 0.5rem은 TextField/SelectField 자체 `mb-2`로 이미 맞아떨어진다.
//
// **필수 라벨 = 라벨 전체 `#991e1e`**(§5.5 단정, 별표만이 아니다), 선택 라벨은
// `#808080`(ink-sub) — TextField/SelectField의 `labelClassName` 확장으로 표현한다.
//
// **학교유형은 이 폼에 없다.** `profiles.school_type` 스냅샷은 서버(`api/_routes/performance/session.js`)
// 전담이다(Q61-ⓔ) — 클라이언트가 보낼 수 있는 필드 자체를 만들지 않는다(신뢰 경계).
//
// **'직접 입력' 인터랙션**(원본 `index.html:963-978` 패턴 이식, `performanceCurriculum.js`
// 상단 주석이 이 조립 단계의 책임이라고 명시한 부분): 과목 선택값이 '직접 입력'이면
// (교과군을 '직접 입력'으로 고른 경우도 과목 옵션이 ['직접 입력'] 하나뿐이라 자동으로
// 여기 해당한다) 자유 텍스트 입력을 조건부로 드러낸다. 제출 시 실제 `subject` 값은
// 이 자유 텍스트이지, 리터럴 '직접 입력' 문자열이 아니다(원본 `getSelectedCurriculum`의
// `realSubject` 계산과 동일 규칙).
//
// **상태**: 초기값은 항상 빈 폼이다. 시안의 부분 프리필(교과군 `국어`·과목 `공통국어1`·
// 희망 진로 `의학`)은 예시 스크린샷일 뿐 초기 상태 스펙이 아니라고 §5.5가 단정한다.
// 재방문 시 이전 값 복원은 P13 몫이라 `initialValues`로 열어만 두고 이 컴포넌트가
// 스스로 채우지 않는다.
//
// **검증**: 상식선 — 필수 5필드(+'직접 입력' 선택 시 커스텀 과목명)가 모두 채워질
// 때까지 제출 버튼을 비활성화한다. 그 이상의 필드별 인라인 에러 UI는 시안에 없고
// (§5.5 "검증 에러 상태 시안 없음") 과설계이므로 만들지 않는다.

// §5.5 Q10 결정 — 학년·학기 옵션은 시안에 없어 원본 select 원문을 그대로 옮긴다
// (`suhaengpyeong/index.html:1420-1435`). 학교유형 옵션은 여기 없다 — 폼에서 묻지 않는다.
const GRADE_OPTIONS = ["고1", "고2", "고3"];
const SEMESTER_OPTIONS = ["1학기", "2학기"];

const CUSTOM_SUBJECT_SENTINEL = "직접 입력";

// QA 지적 — 이 세 자유 입력 필드값은 그대로 STEP3 추천 주제 카드의 메타 태그
// (`MetaTag`, 고정 높이 h-7.5·줄바꿈 없는 한 줄)로 흘러간다(`customSubject`→`subject`→
// "교과군/과목" 칩, `careerGoal`→"진로" 칩 — TopicCard.tsx 주석 §8.3 `buildTags`).
// 길게 입력하면 칩 하나가 카드 폭(37.25rem)을 넘겨 레이아웃이 깨진다. 상한은 그
// 칩 실측(폭 = 텍스트 폭 + 좌우 0.375rem, 시안 최장 예시 "국어/공통국어1" 6자 기준)에
// 여유를 두고 잡았다 — 태그로 가지 않는 `previousTopic`도 같은 화면의 다른 필드와
// 일관되게 상한을 둔다(과설계 방지를 위해 넉넉한 값). 잘라내기가 아니라 네이티브
// `maxLength`로 입력 자체를 막는다(초과 시 잘림 금지 — QA 지적).
const CUSTOM_SUBJECT_MAX_LENGTH = 20;
const PREVIOUS_TOPIC_MAX_LENGTH = 40;
const CAREER_GOAL_MAX_LENGTH = 20;

const REQUIRED_LABEL_CLASS = "text-performance-required";
const OPTIONAL_LABEL_CLASS = "text-ink-sub";

// 필수/선택 구분을 색 하나에만 맡기지 않는다(WCAG 1.4.1) — 필수 라벨엔 시각적 `*`(aria-hidden,
// 색만으로 구분 못 하는 사용자를 위한 비색상 단서) + 스크린리더용 "(필수)" sr-only 텍스트를
// 덧붙이고, 선택 라벨엔 눈에 보이는 "(선택)" 접미사를 텍스트로 붙인다.
function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <span aria-hidden="true"> *</span>
      <span className="sr-only"> (필수)</span>
    </>
  );
}

function optionalLabel(text: string) {
  return `${text} (선택)`;
}

// `SelectField`/`TextField`의 `label` prop은 `string`으로 타입돼 있다(auth 도메인 컴포넌트,
// 이 배치 밖). 실제로는 두 컴포넌트 모두 그 값을 그대로 JSX 자식으로 렌더할 뿐이라
// `RequiredLabel`(ReactNode)을 넘겨도 런타임 동작은 정확하다 — 로직을 바꾸지 않고 이
// 로컬 캐스트로만 타입을 맞춘다.
function asLabel(node: ReactNode): string {
  return node as unknown as string;
}

type BasicInfoFormValues = {
  gradeLabel: string;
  semester: string;
  subjectGroup: string;
  subject: string;
  customSubject: string;
  previousTopic: string;
  careerGoal: string;
};

const EMPTY_VALUES: BasicInfoFormValues = {
  gradeLabel: "",
  semester: "",
  subjectGroup: "",
  subject: "",
  customSubject: "",
  previousTopic: "",
  careerGoal: "",
};

const REQUIRED_KEYS: Array<keyof BasicInfoFormValues> = [
  "gradeLabel",
  "semester",
  "subjectGroup",
  "subject",
  "careerGoal",
];

const INFO_ITEMS = [
  {
    label: "교과군 · 과목",
    body: "과목별 평가 기준과 교육과정 학습 목표를 확인해, 탐구가 어느 단원과 연결되는지 정합니다.",
  },
  {
    label: "이전에 한 주제",
    body: "겹치지 않으면서 연계되는 심화 주제를 설계합니다. 학생부는 한 편이 아니라 흐름으로 읽힙니다.",
  },
  {
    label: "희망 진로",
    body: "교과와 진로가 동시에 맞닿는 지점을 찾는 것이 이 서비스의 출발점입니다.",
  },
];

type BasicInfoFormSubmitValues = {
  gradeLabel: string;
  semester: string;
  subjectGroup: string;
  subject: string;
  previousTopic: string;
  careerGoal: string;
};

type BasicInfoFormProps = {
  /** 부분 초기값(P13 재방문 복원이 채운다). 생략하면 빈 폼. */
  initialValues?: Partial<BasicInfoFormValues>;
  /** 검증 통과 후 호출. `subject`는 '직접 입력' 선택 시 이미 커스텀 텍스트로 치환된
   * 최종값이다. */
  onSubmit?: (values: BasicInfoFormSubmitValues) => void;
  /** true면 버튼이 로딩 상태로 잠긴다. */
  submitting?: boolean;
  /** 제출 실패 메시지(서버 응답 등). 폼 자체 검증 에러가 아니다. */
  submitError?: string | null;
};

export default function BasicInfoForm({
  initialValues,
  onSubmit,
  submitting = false,
  submitError = null,
}: BasicInfoFormProps) {
  const [values, setValues] = useState<BasicInfoFormValues>({
    ...EMPTY_VALUES,
    ...initialValues,
  });
  // 과목 옵션 갱신·값 초기화를 스크린리더에 알리는 sr-only aria-live 문구(WARN #3).
  const [subjectAnnouncement, setSubjectAnnouncement] = useState("");

  const subjectOptions = useMemo(
    () => (values.subjectGroup ? getSubjectOptions(values.subjectGroup) : []),
    [values.subjectGroup],
  );

  const isSubjectCustom = values.subject === CUSTOM_SUBJECT_SENTINEL;

  function setField(key: keyof BasicInfoFormValues, value: string) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "subjectGroup") {
        // 교과군이 바뀌면 과목 옵션이 갱신된다 — 기존 선택값이 새 옵션에 없으면 초기화한다.
        const nextOptions = value ? getSubjectOptions(value) : [];
        if (!nextOptions.includes(prev.subject)) {
          next.subject = "";
          next.customSubject = "";
        }
      }

      if (key === "subject" && value !== CUSTOM_SUBJECT_SENTINEL) {
        next.customSubject = "";
      }

      return next;
    });
  }

  // 교과군 변경 전용 핸들러 — setField의 리셋 로직은 그대로 재사용하되, 옵션 개수·초기화
  // 여부를 aria-live sr-only 문구로 함께 announce한다(WARN #3). `values`는 이 함수가
  // 정의되는 렌더 시점의 최신 상태를 클로저로 캡처하므로 stale 걱정 없다.
  function handleSubjectGroupChange(value: string) {
    const nextOptions = value ? getSubjectOptions(value) : [];
    const willReset =
      values.subject !== "" && !nextOptions.includes(values.subject);

    setField("subjectGroup", value);

    if (!value) {
      setSubjectAnnouncement("교과군을 선택하면 과목을 고를 수 있습니다.");
    } else if (willReset) {
      setSubjectAnnouncement(
        `과목 옵션이 ${nextOptions.length}개로 갱신되었습니다. 선택했던 과목은 새 옵션에 없어 초기화되었습니다.`,
      );
    } else {
      setSubjectAnnouncement(
        `과목 옵션이 ${nextOptions.length}개로 갱신되었습니다.`,
      );
    }
  }

  const isValid =
    REQUIRED_KEYS.every((key) => values[key].trim() !== "") &&
    (!isSubjectCustom || values.customSubject.trim() !== "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValid || submitting) return;

    onSubmit?.({
      gradeLabel: values.gradeLabel,
      semester: values.semester,
      subjectGroup: values.subjectGroup,
      subject: isSubjectCustom ? values.customSubject.trim() : values.subject,
      previousTopic: values.previousTopic.trim(),
      careerGoal: values.careerGoal.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label={asLabel(<RequiredLabel>학년</RequiredLabel>)}
          name="gradeLabel"
          required
          labelClassName={REQUIRED_LABEL_CLASS}
          size="perf"
          value={values.gradeLabel}
          onChange={(value) => setField("gradeLabel", value)}
          options={GRADE_OPTIONS}
          placeholder="학년 선택"
        />
        <SelectField
          label={asLabel(<RequiredLabel>학기</RequiredLabel>)}
          name="semester"
          required
          labelClassName={REQUIRED_LABEL_CLASS}
          size="perf"
          value={values.semester}
          onChange={(value) => setField("semester", value)}
          options={SEMESTER_OPTIONS}
          placeholder="학기 선택"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label={asLabel(<RequiredLabel>교과군</RequiredLabel>)}
          name="subjectGroup"
          required
          labelClassName={REQUIRED_LABEL_CLASS}
          size="perf"
          value={values.subjectGroup}
          onChange={handleSubjectGroupChange}
          options={SUBJECT_GROUPS}
          placeholder="교과군 선택"
        />
        <SelectField
          label={asLabel(<RequiredLabel>과목</RequiredLabel>)}
          name="subject"
          required
          labelClassName={REQUIRED_LABEL_CLASS}
          size="perf"
          value={values.subject}
          onChange={(value) => setField("subject", value)}
          options={subjectOptions}
          placeholder={
            values.subjectGroup ? "과목 선택" : "교과군을 먼저 선택하세요"
          }
          disabled={!values.subjectGroup}
        />
      </div>

      {/* 교과군 변경 시 과목 옵션 개수·값 초기화 여부를 announce(WARN #3). 시각적으로는
          드러나지 않아야 하므로 sr-only. */}
      <p aria-live="polite" className="sr-only">
        {subjectAnnouncement}
      </p>

      {isSubjectCustom && (
        <TextField
          label={asLabel(<RequiredLabel>과목명 직접 입력</RequiredLabel>)}
          name="customSubject"
          required
          labelClassName={REQUIRED_LABEL_CLASS}
          size="perf"
          value={values.customSubject}
          onChange={(value) => setField("customSubject", value)}
          placeholder="예: 심화 국어 특강"
          maxLength={CUSTOM_SUBJECT_MAX_LENGTH}
        />
      )}

      <TextField
        label={optionalLabel("같은 과목에서 이전에 한 주제")}
        name="previousTopic"
        labelClassName={OPTIONAL_LABEL_CLASS}
        size="perf"
        value={values.previousTopic}
        onChange={(value) => setField("previousTopic", value)}
        placeholder="예: 항생제 내성, 조건부확률, 소설 속 인물 심리 분석"
        maxLength={PREVIOUS_TOPIC_MAX_LENGTH}
      />

      <TextField
        label={asLabel(<RequiredLabel>희망 진로</RequiredLabel>)}
        name="careerGoal"
        required
        labelClassName={REQUIRED_LABEL_CLASS}
        size="perf"
        value={values.careerGoal}
        onChange={(value) => setField("careerGoal", value)}
        placeholder="예: 의학, 컴퓨터공학, 심리학"
        maxLength={CAREER_GOAL_MAX_LENGTH}
      />

      {/* 안내 패널 — §5.5 단정 실측(536×216, r8, fill performance-bubble, stroke performance-line).
          학년·학기는 다루지 않는다(§5.5 명시 — 이 결정 범위 밖). */}
      <div className="rounded-lg border border-performance-line bg-performance-bubble px-5 py-4">
        <p className="text-app-label font-medium text-ink">
          이 세 가지를 왜 묻나요?
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {INFO_ITEMS.map((item) => (
            <li key={item.label}>
              <p className="text-app-label font-medium text-ink">
                {item.label}
              </p>
              <p className="mt-1 text-app-label text-ink-sub">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>

      {submitError && (
        <p role="alert" className="text-app-label text-[#d01c1c]">
          {submitError}
        </p>
      )}

      {/* CTA — §5.5 단정 33.5rem×3.25rem r0.75rem fill primary(#013262, §11.1 Q5 결정),
          전폭. PrimaryButton 기본값(size='default': h-3.25rem·rounded-xl, fullWidth=true)이
          이미 정확히 이 치수라 별도 variant 없이 그대로 재사용한다. */}
      <PrimaryButton type="submit" disabled={!isValid} loading={submitting}>
        다음 단계로
      </PrimaryButton>
    </form>
  );
}
