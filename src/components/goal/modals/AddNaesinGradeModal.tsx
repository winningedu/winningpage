import type { ChangeEvent } from "react";
import { useEffect, useId, useState } from "react";
import AppModal from "@/components/goal/AppModal";
import ModalField from "@/components/goal/ModalField";

// 내신 성적 추가 모달(#36, 530×537 = 33.125rem×33.5625rem) — #35 내신 표의 `+ 회차 추가` 트리거.
// `AddMockExamGradeModal`(part-08 #22, 모의고사 표 전용)과 동일한 셸 패턴(회차/응시일 2열 +
// 과목별 입력 리스트)을 따르되 필드 구성이 다르다: 회차 셀렉트 대신 `학기` 텍스트, 응시일 대신
// `입력일`, 백분위 대신 등급(1~9, 소수 1자리).
// QA 행290 재설계(팀장 지시 항목10) — 4과목 flat(국/수/영/"탐구"로 잘못 라벨된 4번째 칸)에서
// 6과목군(온보딩 NAESIN_SUBJECT_GROUPS와 같은 키)으로 바꾼다. 내신에는 원래 "탐구"라는
// 과목이 없다 — 구판의 science 키는 실제로 "과학"이 아니라 "탐구" 라벨을 달고 있었는데,
// 이는 온보딩 구조가 없던 시절의 임시 대체였다(api/_routes/goal/grades.ts NAESIN_SUBJECT_KEYS와
// 키가 같아야 한다).
const SUBJECTS = [
  { key: "korean", label: "국어" },
  { key: "math", label: "수학" },
  { key: "english", label: "영어" },
  { key: "social_history", label: "사회・역사" },
  { key: "science", label: "과학" },
  { key: "second_language", label: "제2외국어" },
];

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

// 등급 입력 행 — ModalField의 라벨-위/컨트롤-아래 레이아웃과 달리 시안(#36)은 "국어 [입력] 등급"
// 한 줄 구성이라 AddMockExamGradeModal의 PercentileField와 같은 이유로 로컬 서브컴포넌트로 둔다.
type GradeFieldProps = {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

function GradeField({ label, value, onChange }: GradeFieldProps) {
  const fieldId = useId();
  return (
    <div className="flex items-center gap-3">
      <label
        htmlFor={fieldId}
        className="w-14 shrink-0 text-app-label font-semibold text-ink-strong"
      >
        {label}
      </label>
      <div className="relative flex-1">
        <input
          id={fieldId}
          type="number"
          min={1}
          max={9}
          step={0.1}
          value={value}
          onChange={onChange}
          placeholder="3.2"
          className="h-9.75 w-full rounded-lg border border-[#E3E3E3] bg-white px-3.5 pr-14 text-right text-app-body text-ink placeholder:text-ink-sub focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-app-label text-ink-sub">
          등급
        </span>
      </div>
    </div>
  );
}

type NaesinEntry = {
  term: string;
  enteredAt: string;
  subjects: Record<string, string>;
};

type AddNaesinGradeModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (entry: NaesinEntry) => Promise<{ ok: boolean; detail?: string }>;
  // 편집 모드(회차 수정) 전용 — 있으면 폼을 이 값으로 채우고 타이틀·저장 버튼 문구를
  // 수정 모드로 바꾼다(성적관리 행322, 팀장 지시 "기존 폼을 편집 모드로 재사용"). 없으면
  // 기존 추가 모드 그대로.
  initialEntry?: NaesinEntry;
};

// onSubmit: async (entry) => {ok:boolean, detail?:string} — entry = {term, enteredAt, subjects}.
// 실제 API 호출(addGoalGrade/updateGoalGrade)은 호출부(Grades.jsx)가 맡는다 — 이 모달은
// 입력 UI와 폼 상태만 소유한다(house 패턴, AddMockExamGradeModal과 동일).
export default function AddNaesinGradeModal({
  open,
  onClose,
  onSubmit,
  initialEntry,
}: AddNaesinGradeModalProps) {
  const isEditMode = Boolean(initialEntry);
  const [semester, setSemester] = useState("");
  const [enteredAt, setEnteredAt] = useState(todayDateValue());
  const [grades, setGrades] = useState<Record<string, string>>({
    korean: "",
    math: "",
    english: "",
    social_history: "",
    science: "",
    second_language: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    if (initialEntry) {
      setSemester(initialEntry.term);
      setEnteredAt(initialEntry.enteredAt);
      setGrades({
        korean: String(initialEntry.subjects.korean ?? ""),
        math: String(initialEntry.subjects.math ?? ""),
        english: String(initialEntry.subjects.english ?? ""),
        social_history: String(initialEntry.subjects.social_history ?? ""),
        science: String(initialEntry.subjects.science ?? ""),
        second_language: String(initialEntry.subjects.second_language ?? ""),
      });
    } else {
      setSemester("");
      setEnteredAt(todayDateValue());
      setGrades({
        korean: "",
        math: "",
        english: "",
        social_history: "",
        science: "",
        second_language: "",
      });
    }
    setError("");
  }

  // AppModal은 열려 있는 동안 언마운트되지 않는다(Dialog가 내부에서 열림 상태만 토글) —
  // 그래서 open으로 전환될 때마다 initialEntry 기준으로 폼을 다시 채운다(수정 대상이
  // 바뀌었거나, 직전 추가/수정 이후 남은 값을 지우기 위해).
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetForm은 매 렌더 새로 생성되는 클로저라 deps에 넣으면 무한 루프가 된다 — open/initialEntry 변경 시에만 재실행하는 것이 의도.
  useEffect(() => {
    if (open) resetForm();
  }, [open, initialEntry]);

  const canSubmit =
    !submitting &&
    semester.trim().length > 0 &&
    enteredAt.trim().length > 0 &&
    // SUBJECTS의 key는 grades 초기값에 항상 존재하는 고정 필드다.
    SUBJECTS.every(({ key }) => grades[key]!.toString().trim().length > 0);

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const result = await onSubmit({
      term: semester.trim(),
      enteredAt,
      subjects: grades,
    });
    setSubmitting(false);

    if (!result?.ok) {
      setError(result?.detail || "저장에 실패했습니다. 다시 시도해 주세요.");
      return;
    }
    handleClose();
  }

  return (
    <AppModal
      open={open}
      onClose={handleClose}
      title={isEditMode ? "내신 성적 수정" : "내신 성적 추가"}
      subtitle="학기별 과목 등급을 입력하면 평균이 자동 환산돼요"
      cancelLabel="취소"
      onCancel={handleClose}
      submitLabel={
        submitting ? "저장 중…" : isEditMode ? "수정 저장하기" : "성적 저장하기"
      }
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
    >
      {error && (
        <p className="rounded-lg bg-[#FCE4E4] px-3 py-2 text-app-label leading-normal text-[#D14343]">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <ModalField
          label="학기"
          value={semester}
          onChange={(event) => setSemester(event.target.value)}
          placeholder="예) 고2 2학기 중간"
          required
        />
        <ModalField
          label="입력일"
          variant="date"
          value={enteredAt}
          onChange={(event) => setEnteredAt(event.target.value)}
          required
        />
      </div>

      <div>
        <p className="mb-6.75 text-app-label font-semibold text-ink-strong">
          과목별 등급<span className="ml-1 text-error">*</span>
        </p>
        <div className="flex flex-col gap-3">
          {SUBJECTS.map(({ key, label }) => (
            <GradeField
              key={key}
              label={label}
              value={grades[key]!}
              onChange={(event) =>
                setGrades((prev) => ({ ...prev, [key]: event.target.value }))
              }
            />
          ))}
        </div>
      </div>
    </AppModal>
  );
}
