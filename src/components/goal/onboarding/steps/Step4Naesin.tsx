import { useMemo, useState } from "react";
import GradeNumberField from "@/components/goal/onboarding/GradeNumberField";
import {
  type FlowEntry,
  flowLabel,
  NAESIN_EXAM_FLOW,
  NAESIN_SUBJECT_GROUPS,
} from "@/components/goal/onboarding/onboardingOptions";
import QuestionCard from "@/components/goal/onboarding/QuestionCard";
import WizardActions from "@/components/goal/onboarding/WizardActions";
import {
  type NaesinGroupState,
  type NaesinState,
  useGoalOnboarding,
} from "@/context/GoalOnboardingContext";

// QA 행290 재설계 — qa3-held-high-design.md §2. 원본(target 앱 IntakeForm.tsx)
// 은 "마지막으로 본 시험 1개 선택 + 그 시험까지의 전체 평균 등급 + 최근 3시험 × 6과목군
// 편집기"였다. 우리 구 4단계(고정 4회차 × 단일 등급 체크박스)를 그 구조로 교체한다.
//
// 스케일: 고1・고2는 5등급제, 고3은 9등급제(2025학년도 고1부터 실제 제도가 5등급제 —
// 설계안 §9 결정②, 원본대로 번복). 서버가 fiveScaleToNine으로 9등급 환산해 저장한다.

const RANK: Record<"g1" | "g2" | "g3", number> = { g1: 0, g2: 1, g3: 2 };

function isValidGrade(raw: string, max: number) {
  const num = Number(raw);
  return raw !== "" && Number.isFinite(num) && num >= 1 && num <= max;
}

function isValidScore100(raw: string) {
  const num = Number(raw);
  return raw !== "" && Number.isFinite(num) && num >= 0 && num <= 100;
}

// 내신 "아직 없음" 특례 문구·도메인 — 고1은 중학교 평균 원점수(0~100), 고2・고3은 이전
// 학년까지의 내신 평균 등급(1~9, 9등급제 — 기존 흐름 유지, 설계안 §2 결정④번 항목).
const PRIOR_NAESIN_COPY: Record<
  "g1" | "g2" | "g3",
  {
    label: string;
    suffix: string;
    bannerTitle: string;
    bannerBody: string;
    isScore: boolean;
  }
> = {
  g1: {
    label: "중학교 내신 평균 점수",
    suffix: "점",
    bannerTitle: "아직 고등학교 내신 성적이 없어요",
    bannerBody: "중학교 때 평균 점수를 기준으로 합격 확률을 계산합니다.",
    isScore: true,
  },
  g2: {
    label: "고1까지 내신 평균 등급",
    suffix: "등급",
    bannerTitle: "올해 내신 성적이 아직 없어요",
    bannerBody:
      "고1까지의 누적 평균 등급과 남은 내신 횟수를 기준으로 합격 확률을 계산합니다.",
    isScore: false,
  },
  g3: {
    label: "고2까지 내신 평균 등급",
    suffix: "등급",
    bannerTitle: "올해 내신 성적이 아직 없어요",
    bannerBody:
      "고2까지의 누적 평균 등급과 남은 내신 횟수를 기준으로 합격 확률을 계산합니다.",
    isScore: false,
  },
};

function isValidPrior(raw: string, grade: "g1" | "g2" | "g3") {
  const copy = PRIOR_NAESIN_COPY[grade];
  return copy.isScore ? isValidScore100(raw) : isValidGrade(raw, 9);
}

type NaesinGroupEditorProps = {
  label: string;
  group: NaesinGroupState;
  onAvgChange: (avg: string) => void;
  onSubjectsChange: (subjects: { name: string; grade: string }[]) => void;
};

// 과목군 1행 — 군 평균 직접 입력 또는 "세부 과목 펼치기"로 {과목명, 등급} N행을 추가하면
// 군 평균이 단순 평균(round2)으로 자동 갱신된다(원본 NaesinSubjectEditor 규칙 그대로,
// 자동 계산은 GoalOnboardingContext.setNaesinGroupSubjects가 맡는다). 세부 과목이 하나라도
// 있으면 평균 입력은 자동 산출값 표시 전용으로 잠근다 — 직접입력과 자동산출이 동시에 다른
// 값을 주장하는 모순 상태를 막기 위해서다.
function NaesinGroupEditor({
  label,
  group,
  onAvgChange,
  onSubjectsChange,
}: NaesinGroupEditorProps) {
  const [expanded, setExpanded] = useState(group.subjects.length > 0);
  const hasSubjects = group.subjects.length > 0;

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-app-label font-semibold text-ink-strong">
          {label}
        </span>
        <div className="flex items-center gap-3">
          <GradeNumberField
            value={group.avg}
            disabled={hasSubjects}
            suffix="등급"
            width="8rem"
            placeholder="미입력"
            onChange={(event) => onAvgChange(event.target.value)}
          />
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="whitespace-nowrap text-app-label font-semibold text-accent"
          >
            세부 과목 {expanded ? "접기" : "펼치기"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-col gap-2">
          {group.subjects.map((subject, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 과목 행은 자유 추가・삭제되는 순서 리스트라 안정적인 id가 없다.
              key={index}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={subject.name}
                placeholder="과목명"
                onChange={(event) => {
                  const next = group.subjects.map((row, i) =>
                    i === index ? { ...row, name: event.target.value } : row,
                  );
                  onSubjectsChange(next);
                }}
                className="h-11 flex-1 rounded-lg border border-line px-3 text-app-body text-ink placeholder:text-ink-sub focus:border-accent focus:outline-hidden"
              />
              <GradeNumberField
                value={subject.grade}
                width="6.25rem"
                suffix="등급"
                onChange={(event) => {
                  const next = group.subjects.map((row, i) =>
                    i === index ? { ...row, grade: event.target.value } : row,
                  );
                  onSubjectsChange(next);
                }}
              />
              <button
                type="button"
                onClick={() =>
                  onSubjectsChange(group.subjects.filter((_, i) => i !== index))
                }
                className="shrink-0 text-app-label text-ink-sub"
              >
                삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onSubjectsChange([...group.subjects, { name: "", grade: "" }])
            }
            className="self-start text-app-label font-semibold text-accent"
          >
            + 과목 추가
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "다음"/"저장" 버튼 활성 조건 — 온보딩(Step4Naesin)과 내 정보 수정(Profile.tsx 내신
 * 섹션)이 정확히 같은 규칙을 써야 한다(서버 validateNaesinInput과도 짝이 맞아야
 * 400을 미리 걸러낼 수 있다).
 */
export function isNaesinInputValid(
  grade: "g1" | "g2" | "g3",
  naesin: NaesinState,
): boolean {
  const scaleMax = grade === "g3" ? 9 : 5;
  return naesin.lastExam === ""
    ? isValidPrior(naesin.priorNaesinGrade, grade)
    : isValidGrade(naesin.overall, scaleMax);
}

export type NaesinScoreFieldsProps = {
  /** 4단계는 학년을 이미 고른 뒤에만 진입해 항상 채워져 있다(온보딩). 내 정보 수정은
   * 학생의 기존 행에서 넘긴다 — 이 화면으로는 학년 자체를 바꿀 수 없다. */
  grade: "g1" | "g2" | "g3";
  naesin: NaesinState;
  onLastExamChange: (key: string) => void;
  onOverallChange: (value: string) => void;
  onPriorNaesinGradeChange: (value: string) => void;
  onGroupAvgChange: (examKey: string, groupKey: string, avg: string) => void;
  onGroupSubjectsChange: (
    examKey: string,
    groupKey: string,
    subjects: { name: string; grade: string }[],
  ) => void;
};

/**
 * 내신 성적 입력 필드 일체(마지막 시험 선택 → 없음 특례 또는 전체 평균 → 최근 시험별
 * 과목군 평균) — QuestionCard/WizardActions 같은 온보딩 위저드 전용 chrome은 뺐다.
 * Step4Naesin(온보딩)과 Profile.tsx(내 정보 수정) 둘 다 이 컴포넌트를 감싸는 쪽만
 * 다르고 안쪽 필드·검증 규칙은 완전히 같다 — 값·계산이 갈리는 것을 막기 위해
 * 새로 만들지 않고 여기서 뗀 것을 공유한다.
 */
export function NaesinScoreFields({
  grade,
  naesin,
  onLastExamChange,
  onOverallChange,
  onPriorNaesinGradeChange,
  onGroupAvgChange,
  onGroupSubjectsChange,
}: NaesinScoreFieldsProps) {
  const scaleMax = grade === "g3" ? 9 : 5;

  const visibleExams = useMemo(
    () => NAESIN_EXAM_FLOW.filter((exam) => RANK[exam.grade] <= RANK[grade]),
    [grade],
  );

  const allNone = naesin.lastExam === "";
  const selectedIndex = NAESIN_EXAM_FLOW.findIndex(
    (exam) => exam.key === naesin.lastExam,
  );
  const recentExams: FlowEntry[] =
    selectedIndex === -1
      ? []
      : NAESIN_EXAM_FLOW.slice(
          Math.max(0, selectedIndex - 2),
          selectedIndex + 1,
        ).reverse();

  const priorCopy = PRIOR_NAESIN_COPY[grade];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {visibleExams.map((exam) => (
          <button
            key={exam.key}
            type="button"
            onClick={() => onLastExamChange(exam.key)}
            className={`rounded-xl border-2 px-4 py-2.5 text-app-label font-bold transition-colors ${
              naesin.lastExam === exam.key
                ? "border-accent bg-accent text-white"
                : "border-line text-ink-sub hover:border-accent"
            }`}
          >
            {flowLabel(exam)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onLastExamChange("")}
          className={`rounded-xl border-2 px-4 py-2.5 text-app-label font-bold transition-colors ${
            allNone
              ? "border-accent bg-accent text-white"
              : "border-line text-ink-sub hover:border-accent"
          }`}
        >
          아직 없음
        </button>
      </div>

      {allNone ? (
        <div className="mt-8">
          <div className="rounded-xl bg-surface-03 px-5 py-4">
            <p className="text-app-body font-semibold text-accent">
              {priorCopy.bannerTitle}
            </p>
            <p className="mt-1 text-app-body leading-normal text-ink-sub">
              {priorCopy.bannerBody}
            </p>
          </div>
          <div className="mt-6">
            <GradeNumberField
              label={priorCopy.label}
              value={naesin.priorNaesinGrade}
              suffix={priorCopy.suffix}
              width="16rem"
              onChange={(event) => onPriorNaesinGradeChange(event.target.value)}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <GradeNumberField
              label={`그 시험까지의 전체 내신 평균 등급 (${scaleMax === 5 ? "5등급제" : "9등급제"})`}
              value={naesin.overall}
              suffix="등급"
              width="16rem"
              placeholder={scaleMax === 5 ? "예: 1.25" : "예: 2.50"}
              onChange={(event) => onOverallChange(event.target.value)}
            />
          </div>

          {recentExams.length > 0 && (
            <div className="mt-10 flex flex-col gap-8">
              <p className="text-app-body font-semibold text-ink-strong">
                최근 시험별 과목군 평균 (선택 사항)
              </p>
              {recentExams.map((exam) => {
                const examState = naesin.exams[exam.key];
                if (!examState) return null;
                return (
                  <div key={exam.key}>
                    <p className="mb-3 inline-block rounded-lg bg-surface-03 px-2.5 py-1 text-app-label font-black text-accent">
                      {flowLabel(exam)}
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {NAESIN_SUBJECT_GROUPS.map((group) => (
                        <NaesinGroupEditor
                          key={group.key}
                          label={group.label}
                          group={examState.groups[group.key]!}
                          onAvgChange={(avg) =>
                            onGroupAvgChange(exam.key, group.key, avg)
                          }
                          onSubjectsChange={(subjects) =>
                            onGroupSubjectsChange(exam.key, group.key, subjects)
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

type Step4NaesinProps = {
  goPrev: () => void;
  goNext: () => void;
};

export default function Step4Naesin({ goPrev, goNext }: Step4NaesinProps) {
  const {
    naesin,
    grade,
    setNaesinLastExam,
    setNaesinOverall,
    setPriorNaesinGrade,
    setNaesinGroupAvg,
    setNaesinGroupSubjects,
  } = useGoalOnboarding();

  // 4단계는 1단계에서 학년을 고른 뒤에만 진입하므로 grade가 비는 경로는 없으나, 직접 URL
  // 진입 등으로 비었을 때를 대비해 고1을 기본값으로 둔다(방어, Step4Naesin 구판과 동일 관례).
  const safeGrade: "g1" | "g2" | "g3" =
    grade === "g1" || grade === "g2" || grade === "g3" ? grade : "g1";

  const canProceed = isNaesinInputValid(safeGrade, naesin);

  return (
    <>
      <QuestionCard
        step="4"
        label="성적 입력"
        title="마지막으로 본 내신 시험을 선택해 주세요."
        description="목표 대학과의 격차를 계산하는 기준 데이터입니다. 아직 내신 시험을 한 번도 보지 않았다면 '아직 없음'을 선택하세요."
      >
        <NaesinScoreFields
          grade={safeGrade}
          naesin={naesin}
          onLastExamChange={setNaesinLastExam}
          onOverallChange={setNaesinOverall}
          onPriorNaesinGradeChange={setPriorNaesinGrade}
          onGroupAvgChange={setNaesinGroupAvg}
          onGroupSubjectsChange={setNaesinGroupSubjects}
        />
      </QuestionCard>

      <WizardActions
        onPrev={goPrev}
        onNext={goNext}
        nextDisabled={!canProceed}
      />
    </>
  );
}
