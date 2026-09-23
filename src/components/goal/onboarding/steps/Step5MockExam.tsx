import { useMemo } from "react";
import GradeNumberField from "@/components/goal/onboarding/GradeNumberField";
import {
  type FlowEntry,
  flowLabel,
  MOCK_FLOW,
  MOCK_SUBJECTS,
} from "@/components/goal/onboarding/onboardingOptions";
import QuestionCard from "@/components/goal/onboarding/QuestionCard";
import WizardActions from "@/components/goal/onboarding/WizardActions";
import {
  type MockState,
  useGoalOnboarding,
} from "@/context/GoalOnboardingContext";
import { getPercentileChips } from "@/lib/goal/calc/index.js";

// QA 행291 재설계 — qa3-held-high-design.md §3 / 팀장 지시. 원본(target 앱 IntakeForm.tsx)은
// "마지막으로 본 모의고사 1개 선택(학년별 시퀀스, 고3은 5・7모 포함 6회) + 최근 3회차 ×
// 국/수/영/탐구1/탐구2 등급 + 백분위 칩(컷/안정/최고) + 탐구 트랙(과탐/사탐)"이었다. 우리 구
// 5단계(고정 4회차 × 등급만, 밴드 중앙값 추정)를 그 구조로 교체한다.
//
// 등급 입력 후 나오는 백분위 칩은 getPercentileChips(GRADE_PERCENTILE 9구간, jeongsi.js)를
// 그대로 재사용한다 — 서버 밴드와 클라이언트 칩이 같은 값을 가리켜야 하기 때문이다.

const RANK: Record<"g1" | "g2" | "g3", number> = { g1: 0, g2: 1, g3: 2 };

function isValidGrade(raw: string) {
  const num = Number(raw);
  return raw !== "" && Number.isFinite(num) && num >= 1 && num <= 9;
}

// 등급을 입력하면 백분위 칩 중 "안정"(밴드 중앙값)을 기본 선택값으로 미리 골라 둔다 —
// 사용자가 칩을 직접 누르지 않아도 서버 기본값(gradeToPercentile 밴드 중앙값 대체)과
// 화면 표시가 항상 일치하게 하기 위함이다. 로컬 E2E 후속 — 등급만 입력하고 칩을 안
// 누르면 어떤 칩도 선택 상태로 보이지 않던 문제를 고친다.
function stablePercentile(gradeStr: string): string {
  const chips = getPercentileChips(gradeStr);
  const stable = chips.find((chip) => chip.label.includes("안정"));
  return stable ? String(stable.value) : "";
}

type PercentileSubjectKey = "kor" | "math" | "tam1" | "tam2";

/**
 * "다음"/"저장" 버튼 활성 조건 — 온보딩(Step5MockExam)과 내 정보 수정(Profile.tsx
 * 모의고사 섹션)이 정확히 같은 규칙을 써야 한다(서버 validateMockExamInput과도
 * 짝이 맞아야 400을 미리 걸러낼 수 있다).
 */
export function isMockExamInputValid(
  // 선택한 회차 자체가 이미 학년 이하로만 노출되므로(MockExamScoreFields의
  // visibleRounds) 이 규칙은 grade를 쓰지 않는다 — isNaesinInputValid와 시그니처를
  // 맞춰 두 섹션의 저장 버튼 gating 호출부가 같은 모양이 되게 한다.
  _grade: "g1" | "g2" | "g3",
  mockExam: MockState,
): boolean {
  const allNone = mockExam.lastRound === "";
  if (allNone) return true;

  const selectedIndex = MOCK_FLOW.findIndex(
    (round) => round.key === mockExam.lastRound,
  );
  const selectedRound =
    selectedIndex === -1
      ? null
      : (mockExam.rounds[MOCK_FLOW[selectedIndex]!.key] ?? null);
  return (
    mockExam.track !== "" &&
    selectedRound != null &&
    isValidGrade(selectedRound.kor.grade) &&
    isValidGrade(selectedRound.math.grade) &&
    isValidGrade(selectedRound.eng.grade) &&
    isValidGrade(selectedRound.tam1.grade) &&
    isValidGrade(selectedRound.tam2.grade)
  );
}

export type MockExamScoreFieldsProps = {
  /** 5단계는 학년을 이미 고른 뒤에만 진입해 항상 채워져 있다(온보딩). 내 정보 수정은
   * 학생의 기존 행에서 넘긴다 — 이 화면으로는 학년 자체를 바꿀 수 없다. */
  grade: "g1" | "g2" | "g3";
  mockExam: MockState;
  onLastRoundChange: (key: string) => void;
  onTrackChange: (track: "과탐" | "사탐") => void;
  onSubjectChange: (
    roundKey: string,
    subjectKey: PercentileSubjectKey,
    patch: { grade?: string; pct?: string },
  ) => void;
  onEnglishGradeChange: (roundKey: string, grade: string) => void;
};

/**
 * 모의고사 성적 입력 필드 일체(마지막 회차 선택 → 없음 안내 또는 탐구 트랙+최근
 * 회차별 5과목 등급·백분위 칩) — QuestionCard/WizardActions 같은 온보딩 위저드
 * 전용 chrome은 뺐다. Step5MockExam(온보딩)과 Profile.tsx(내 정보 수정) 둘 다 이
 * 컴포넌트를 감싸는 쪽만 다르고 안쪽 필드·검증 규칙은 완전히 같다.
 */
export function MockExamScoreFields({
  grade,
  mockExam,
  onLastRoundChange,
  onTrackChange,
  onSubjectChange,
  onEnglishGradeChange,
}: MockExamScoreFieldsProps) {
  const visibleRounds = useMemo(
    () => MOCK_FLOW.filter((round) => RANK[round.grade] <= RANK[grade]),
    [grade],
  );

  const allNone = mockExam.lastRound === "";
  const selectedIndex = MOCK_FLOW.findIndex(
    (round) => round.key === mockExam.lastRound,
  );
  const recentRounds: FlowEntry[] =
    selectedIndex === -1
      ? []
      : MOCK_FLOW.slice(
          Math.max(0, selectedIndex - 2),
          selectedIndex + 1,
        ).reverse();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {visibleRounds.map((round) => (
          <button
            key={round.key}
            type="button"
            onClick={() => onLastRoundChange(round.key)}
            className={`rounded-xl border-2 px-4 py-2.5 text-app-label font-bold transition-colors ${
              mockExam.lastRound === round.key
                ? "border-accent bg-accent text-white"
                : "border-line text-ink-sub hover:border-accent"
            }`}
          >
            {flowLabel(round)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onLastRoundChange("")}
          className={`rounded-xl border-2 px-4 py-2.5 text-app-label font-bold transition-colors ${
            allNone
              ? "border-accent bg-accent text-white"
              : "border-line text-ink-sub hover:border-accent"
          }`}
        >
          없음
        </button>
      </div>

      {allNone ? (
        <p className="mt-8 rounded-xl bg-surface-03 px-5 py-4 text-app-body leading-normal text-ink-sub">
          모의고사 성적이 없어 정시 합격 확률은 0%에서 시작합니다. 지금은
          내신(수시) 기준으로 계산하고, 모의고사를 보고 성적을 입력하면 정시가
          반영돼요.
        </p>
      ) : (
        <>
          <div className="mt-8">
            <p className="mb-2 text-app-label text-ink-sub">탐구 선택 과목</p>
            <div className="flex gap-2">
              {(["과탐", "사탐"] as const).map((track) => (
                <button
                  key={track}
                  type="button"
                  onClick={() => onTrackChange(track)}
                  className={`rounded-xl border-2 px-5 py-2.5 text-app-label font-bold transition-colors ${
                    mockExam.track === track
                      ? "border-accent bg-accent text-white"
                      : "border-line text-ink-sub hover:border-accent"
                  }`}
                >
                  {track}
                </button>
              ))}
            </div>
          </div>

          {recentRounds.length > 0 && (
            <div className="mt-10 flex flex-col gap-8">
              {recentRounds.map((round) => {
                const roundState = mockExam.rounds[round.key];
                if (!roundState) return null;
                return (
                  <div key={round.key}>
                    <p className="mb-3 inline-block rounded-lg bg-surface-03 px-2.5 py-1 text-app-label font-black text-accent">
                      {flowLabel(round)}
                    </p>
                    <div className="flex flex-col gap-3">
                      {MOCK_SUBJECTS.map((subject) => {
                        const subjectKey = subject.key as PercentileSubjectKey;
                        const entry = roundState[subjectKey];
                        const chips = getPercentileChips(entry.grade);
                        return (
                          <div
                            key={subject.key}
                            className="rounded-xl border border-line p-4"
                          >
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="w-14 shrink-0 text-app-label font-bold text-ink-strong">
                                {subject.label}
                              </span>
                              <GradeNumberField
                                value={entry.grade}
                                width="6.25rem"
                                placeholder="1~9"
                                onChange={(event) => {
                                  const nextGrade = event.target.value;
                                  onSubjectChange(round.key, subjectKey, {
                                    grade: nextGrade,
                                    // 등급이 바뀌면 이전 등급 기준으로 고른 백분위 칩은
                                    // 더 이상 유효하지 않다 — "안정"(밴드 중앙값)을
                                    // 기본 선택으로 다시 골라 둔다(원본 추정과 동일한
                                    // 서버 기본값, stablePercentile 참고).
                                    pct: stablePercentile(nextGrade),
                                  });
                                }}
                              />
                              {chips.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {chips.map((chip) => {
                                    const selected =
                                      entry.pct === String(chip.value);
                                    return (
                                      <button
                                        key={chip.value}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() =>
                                          onSubjectChange(
                                            round.key,
                                            subjectKey,
                                            { pct: String(chip.value) },
                                          )
                                        }
                                        className={`rounded-full border px-3 py-1 text-app-caption font-bold transition-colors ${
                                          selected
                                            ? "border-accent bg-accent text-white"
                                            : "border-line text-ink-sub hover:border-accent"
                                        }`}
                                      >
                                        {chip.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      <div className="rounded-xl border border-line p-4">
                        <div className="flex items-center gap-3">
                          <span className="w-14 shrink-0 text-app-label font-bold text-ink-strong">
                            영어
                          </span>
                          <GradeNumberField
                            value={roundState.eng.grade}
                            width="6.25rem"
                            placeholder="1~9"
                            onChange={(event) =>
                              onEnglishGradeChange(
                                round.key,
                                event.target.value,
                              )
                            }
                          />
                          <span className="text-app-caption text-ink-sub">
                            절대평가 · 백분위 없음
                          </span>
                        </div>
                      </div>
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

type Step5MockExamProps = {
  goPrev: () => void;
  goNext: () => void;
};

export default function Step5MockExam({ goPrev, goNext }: Step5MockExamProps) {
  const {
    mockExam,
    grade,
    setMockLastRound,
    setMockTrack,
    updateMockSubject,
    setMockEnglishGrade,
  } = useGoalOnboarding();

  const safeGrade: "g1" | "g2" | "g3" =
    grade === "g1" || grade === "g2" || grade === "g3" ? grade : "g1";

  const canProceed = isMockExamInputValid(safeGrade, mockExam);

  return (
    <>
      <QuestionCard
        step="5"
        label="성적 입력"
        title="마지막으로 본 모의고사를 선택해 주세요."
        description="목표 대학과의 격차를 계산하는 기준 데이터입니다. 아직 모의고사를 보지 않았다면 '없음'을 선택하세요."
      >
        <MockExamScoreFields
          grade={safeGrade}
          mockExam={mockExam}
          onLastRoundChange={setMockLastRound}
          onTrackChange={setMockTrack}
          onSubjectChange={updateMockSubject}
          onEnglishGradeChange={setMockEnglishGrade}
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
