import type { ChangeEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import AppModal from "@/components/goal/AppModal";
import { MOCK_EXAM_ROUNDS } from "@/components/goal/goalFormOptions";
import ModalField from "@/components/goal/ModalField";

// 모의고사 성적 추가 모달 — docs/figma-goal/part-08.md #22 (530×574 = 33.125rem × 35.875rem,
// 높이는 주석용). 트리거: MockExamCard("+ 성적 추가").
const ROUND_OPTIONS = MOCK_EXAM_ROUNDS.map((label) => ({
  value: label,
  label,
}));

// part-08 §177: 시안의 백분위 입력값(82/74/88/76)은 연회색으로 렌더돼 실제 입력값이 아니라
// placeholder로 판단된다(추정). 그대로 placeholder 예시값으로만 재사용하고 실제 상태는 빈 값으로 시작.
//
// QA 행291 재설계(팀장 지시 항목10) — 탐구 단일에서 탐구1・탐구2로 나눈다(온보딩
// MOCK_SUBJECTS와 같은 분리, api/_routes/goal/grades.ts MOCK_SUBJECT_KEYS와 키가 같아야 한다).
const SUBJECTS = [
  { key: "korean", label: "국어", placeholder: "82" },
  { key: "math", label: "수학", placeholder: "74" },
  { key: "english", label: "영어", placeholder: "88" },
  { key: "tam1", label: "탐구1", placeholder: "76" },
  { key: "tam2", label: "탐구2", placeholder: "76" },
];

// 과목별 백분위 행 — ModalField(라벨 위/컨트롤 아래)와 달리 시안(#22)은 "국어 82 백분위"처럼
// 라벨-입력-접미가 한 줄에 나란히 놓인다. 레이아웃이 달라 ModalField를 재사용하지 않고 로컬
// 서브컴포넌트로 둔다.
type PercentileFieldProps = {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
};

function PercentileField({
  label,
  value,
  onChange,
  placeholder,
}: PercentileFieldProps) {
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
          min={0}
          max={100}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="h-9.75 w-full rounded-lg border border-[#E3E3E3] bg-white px-3.5 pr-14 text-app-body text-ink placeholder:text-ink-sub focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-app-label text-ink-sub">
          백분위
        </span>
      </div>
    </div>
  );
}

type MockExamEntry = {
  term: string;
  examDate: string;
  subjects: Record<string, string>;
};

type AddMockExamGradeModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (entry: MockExamEntry) => Promise<{ ok: boolean; detail?: string }>;
  // 편집 모드(회차 수정) 전용 — 있으면 폼을 이 값으로 채우고 타이틀·저장 버튼 문구를
  // 수정 모드로 바꾼다(성적관리 행322). 없으면 기존 추가 모드 그대로.
  initialEntry?: MockExamEntry;
};

// onSubmit: async (entry) => {ok:boolean, detail?:string} — entry = {term, examDate, subjects}.
// 실제 API 호출(addGoalGrade/updateGoalGrade)은 호출부(Grades.jsx)가 맡는다.
export default function AddMockExamGradeModal({
  open,
  onClose,
  onSubmit,
  initialEntry,
}: AddMockExamGradeModalProps) {
  const isEditMode = Boolean(initialEntry);

  // ROUND_OPTIONS(당해 연도 4건 고정)에 없는 과거 연도 회차를 수정할 수도 있다 — 그 경우
  // 네이티브 select가 어떤 옵션도 선택된 상태로 보여주지 못한다(판단 지점, 시안엔 이
  // 케이스가 없다). 편집 대상 term이 목록에 없으면 그 값을 옵션 맨 앞에 얹어 select가
  // 항상 현재 값을 정확히 보여주게 한다.
  const options = useMemo(() => {
    if (
      !initialEntry ||
      ROUND_OPTIONS.some((option) => option.value === initialEntry.term)
    ) {
      return ROUND_OPTIONS;
    }
    return [
      { value: initialEntry.term, label: initialEntry.term },
      ...ROUND_OPTIONS,
    ];
  }, [initialEntry]);

  // ROUND_OPTIONS는 MOCK_EXAM_ROUNDS 고정 목록(14건)에서 파생되어 항상 비지 않는다.
  const [round, setRound] = useState(ROUND_OPTIONS[0]!.value);
  const [examDate, setExamDate] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({
    korean: "",
    math: "",
    english: "",
    tam1: "",
    tam2: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    if (initialEntry) {
      setRound(initialEntry.term);
      setExamDate(initialEntry.examDate);
      setScores({
        korean: String(initialEntry.subjects.korean ?? ""),
        math: String(initialEntry.subjects.math ?? ""),
        english: String(initialEntry.subjects.english ?? ""),
        tam1: String(initialEntry.subjects.tam1 ?? ""),
        tam2: String(initialEntry.subjects.tam2 ?? ""),
      });
    } else {
      setRound(ROUND_OPTIONS[0]!.value);
      setExamDate("");
      setScores({ korean: "", math: "", english: "", tam1: "", tam2: "" });
    }
    setError("");
  }

  // AddNaesinGradeModal과 동일한 이유(AppModal이 open 동안 언마운트되지 않음) — open으로
  // 전환될 때마다 initialEntry 기준으로 폼을 다시 채운다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetForm은 매 렌더 새로 생성되는 클로저라 deps에 넣으면 무한 루프가 된다 — open/initialEntry 변경 시에만 재실행하는 것이 의도.
  useEffect(() => {
    if (open) resetForm();
  }, [open, initialEntry]);

  const canSubmit =
    !submitting &&
    examDate.trim().length > 0 &&
    // SUBJECTS의 key는 scores 초기값에 항상 존재하는 고정 필드다.
    SUBJECTS.every(({ key }) => scores[key]!.toString().trim().length > 0);

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const result = await onSubmit({ term: round, examDate, subjects: scores });
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
      title={isEditMode ? "모의고사 성적 수정" : "모의고사 성적 추가"}
      subtitle="회차별 백분위를 입력하면 목표와의 격차가 다시 계산돼요"
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
          label="회차"
          variant="select"
          value={round}
          onChange={(event) => setRound(event.target.value)}
          options={options}
        />
        <ModalField
          label="응시일"
          variant="date"
          value={examDate}
          onChange={(event) => setExamDate(event.target.value)}
          required
        />
      </div>

      <div>
        <p className="mb-6.75 text-app-label font-semibold text-ink-strong">
          과목별 백분위<span className="ml-1 text-error">*</span>
        </p>
        <div className="flex flex-col gap-3">
          {SUBJECTS.map(({ key, label, placeholder }) => (
            <PercentileField
              key={key}
              label={label}
              placeholder={placeholder}
              value={scores[key]!}
              onChange={(event) =>
                setScores((prev) => ({ ...prev, [key]: event.target.value }))
              }
            />
          ))}
        </div>
      </div>

      <p className="rounded-lg bg-goal-insight-info px-3 py-2 text-app-label leading-normal text-ink">
        {/* 원문 카피(4022:5216)는 "학업 성취도 변화 추이와 합격률 예측에 반영"이지만, 이번 범위는
            기록·표시만 한다(팀장 지시 — 합격률 재계산·그래프 반영 없음). 구현되지 않은 기능을
            약속하는 문구를 그대로 두면 사용자를 오도하므로 실제 동작에 맞게 정정한다. */}
        💡 입력한 백분위는 회차별 성적 표에 기록되어 목표와의 격차를 계산하는 데
        쓰입니다.
      </p>
    </AppModal>
  );
}
