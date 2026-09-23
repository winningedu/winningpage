import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import GoalCard from "@/components/goal/GoalCard";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { NAESIN_SUBJECT_GROUPS } from "@/components/goal/onboarding/onboardingOptions";
import {
  isNaesinInputValid,
  NaesinScoreFields,
} from "@/components/goal/onboarding/steps/Step4Naesin";
import {
  isMockExamInputValid,
  MockExamScoreFields,
} from "@/components/goal/onboarding/steps/Step5MockExam";
import { useAuth } from "@/context/AuthProvider";
import {
  buildInitialState,
  type MockState,
  type NaesinState,
} from "@/context/GoalOnboardingContext";
import type {
  GoalStudentPayload,
  SubmitGoalIntakeUpdateResult,
} from "@/lib/goalApi";
import { submitGoalIntakeUpdate } from "@/lib/goalApi";
import { goalStudentQueryOptions } from "@/lib/queryClient";
import {
  buildMockRoundsPayload,
  buildNaesinExamsPayload,
} from "@/pages/goal/Onboarding";

// 내 정보 수정(QA 2차 시트 행25・31・32) — 온보딩 때 입력한 내신·모의고사 성적을
// 나중에 고칠 화면이 없다는 지적으로 추가한다. 목표 대학 변경은 별도 화면(내 목표
// 대학, TargetUniversity.tsx)이 맡는다 — 이 화면은 성적 두 섹션만 다룬다.
//
// 각 섹션은 "수정" 버튼으로 읽기 전용 요약 ↔ 온보딩과 같은 입력 필드(NaesinScoreFields/
// MockExamScoreFields, Step4Naesin.tsx/Step5MockExam.tsx에서 뗀 것)를 토글한다. 값
// 갱신 로직(아래 setNaesin*/setMock* 함수들)은 GoalOnboardingContext의 동명 setter와
// 같은 규칙(특히 setNaesinGroupSubjects의 round2 자동 평균)을 그대로 옮겼다 — 이
// 화면은 세션스토리지에 얹힌 전체 온보딩 상태(7단계 전부)를 들고 올 필요가 없어
// Provider를 통째로 쓰지 않고 이 두 섹션에 필요한 값만 로컬 state로 따로 갖는다.

type GoalStudentResult =
  | { kind: "onboarded"; student: GoalStudentPayload }
  | {
      kind:
        | "no-session"
        | "error"
        | "not-allowed"
        | "not-onboarded"
        | "awaiting-cuts";
    };

function gradeLabelToWire(label: string): "g1" | "g2" | "g3" {
  if (label === "고1") return "g1";
  if (label === "고2") return "g2";
  return "g3";
}

function toStr(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** naesin_scores(intake.ts 저장 모양, avg/grade가 숫자) → NaesinState(전부 문자열) 부분 변환. */
/**
 * naesin_scores.exams 한 시험 항목({key, groups} 하나)을 NaesinState 과목군 모양으로
 * 변환. NAESIN_SUBJECT_GROUPS 6종 전부를 채운다 — 저장값에 일부 과목군만 있어도
 * NaesinGroupEditor(Step4Naesin.tsx)가 6종 전부를 기대해 나머지가 undefined면
 * 렌더링 중 죽는다(group.subjects 접근).
 */
function normalizeStoredNaesinExamGroups(
  rawGroups: Record<string, unknown>,
): NaesinState["exams"][string]["groups"] {
  const groups: NaesinState["exams"][string]["groups"] = {};
  for (const { key: groupKey } of NAESIN_SUBJECT_GROUPS) {
    const group = rawGroups[groupKey] as
      | { avg?: unknown; subjects?: { name: string; grade: unknown }[] }
      | undefined;
    groups[groupKey] = {
      avg: toStr(group?.avg),
      subjects: (group?.subjects || []).map((subject) => ({
        name: subject.name,
        grade: toStr(subject.grade),
      })),
    };
  }
  return groups;
}

function normalizeStoredNaesin(
  raw: Record<string, unknown> | null,
): NaesinState | undefined {
  if (!raw) return undefined;
  const exams: NaesinState["exams"] = {};
  // naesin_scores.exams는 2026-09-02(749cc3a4) 이후로 시험별 배열
  // `[{ key, groups }]`로만 저장된다 — buildNaesinExamsPayload/naesinExams가 그 모양을
  // 만든다(api/goal/intake.ts). 그 이전(고정 4회차 체크박스 방식)의 원본 형식은 시험
  // key 이름공간 자체가 달라 지금 화면과 호환 불가능이라 별도 변환 없이 그대로
  // 버려진다(buildInitialState가 알 수 없는 키를 자동으로 defaults로 채운다).
  if (Array.isArray(raw.exams)) {
    for (const entry of raw.exams) {
      if (!entry || typeof entry !== "object") continue;
      const { key, groups } = entry as {
        key?: unknown;
        groups?: Record<string, unknown>;
      };
      if (typeof key !== "string" || !key) continue;
      exams[key] = { groups: normalizeStoredNaesinExamGroups(groups || {}) };
    }
  }
  return {
    lastExam: toStr(raw.lastExam),
    overall: toStr(raw.overall),
    priorNaesinGrade: toStr(raw.priorNaesinGrade),
    exams,
  };
}

/** mock_exam_scores(intake.ts 저장 모양, pct가 숫자) → MockState(전부 문자열) 부분 변환. */
function normalizeStoredMock(
  raw: Record<string, unknown> | null,
): MockState | undefined {
  if (!raw) return undefined;
  const rawRounds = (raw.rounds as Record<string, unknown>) || {};
  const rounds: MockState["rounds"] = {};
  for (const [roundKey, roundValue] of Object.entries(rawRounds)) {
    const round = roundValue as Record<
      string,
      { grade?: unknown; pct?: unknown } | undefined
    >;
    rounds[roundKey] = {
      kor: { grade: toStr(round.kor?.grade), pct: toStr(round.kor?.pct) },
      math: { grade: toStr(round.math?.grade), pct: toStr(round.math?.pct) },
      eng: { grade: toStr(round.eng?.grade) },
      tam1: { grade: toStr(round.tam1?.grade), pct: toStr(round.tam1?.pct) },
      tam2: { grade: toStr(round.tam2?.grade), pct: toStr(round.tam2?.pct) },
    };
  }
  return {
    lastRound: toStr(raw.lastRound),
    track: (raw.track as "과탐" | "사탐" | "") || "",
    rounds,
  };
}

function updateErrorMessage(result: SubmitGoalIntakeUpdateResult): string {
  if (result.kind === "cuts-missing") {
    return "목표 대학의 합격 기준 데이터가 아직 준비되지 않았습니다.";
  }
  if (result.kind === "validation-error") {
    return result.detail || "입력값을 확인해 주세요.";
  }
  if (result.kind === "not-onboarded") {
    return "먼저 온보딩을 완료해 주세요.";
  }
  return "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function Profile() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const goalStudentQuery = useQuery(goalStudentQueryOptions(userId));
  const result = goalStudentQuery.isPending
    ? null
    : ((goalStudentQuery.data as GoalStudentResult | undefined) ?? null);

  const [editingSection, setEditingSection] = useState<
    "naesin" | "mock" | null
  >(null);
  const [naesinDraft, setNaesinDraft] = useState<NaesinState | null>(null);
  const [mockDraft, setMockDraft] = useState<MockState | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (result === null || result.kind !== "onboarded") {
    const message =
      result?.kind === "awaiting-cuts"
        ? "합격 기준 데이터를 준비 중입니다. 잠시 후 다시 확인해 주세요."
        : result === null
          ? "내 정보를 불러오는 중입니다…"
          : "내 정보를 불러오지 못했습니다. 새로고침해 주세요.";
    return (
      <>
        <GoalPageHeader
          title="내 정보 수정"
          subcopy="학생 정보와 목표 설정을 관리합니다."
        />
        <div className="max-w-goal-content px-4 pb-24 md:px-12">
          <GoalCard tone="neutral" className="px-8 py-7">
            <p className="text-app-body leading-[1.4] text-ink-sub">
              {message}
            </p>
          </GoalCard>
        </div>
      </>
    );
  }

  const { student } = result;
  const wireGrade = gradeLabelToWire(student.profile.grade);

  function startEditingNaesin() {
    const normalized = normalizeStoredNaesin(student.naesinInput);
    const seeded = buildInitialState(
      normalized ? { naesin: normalized } : null,
    ).naesin;
    setNaesinDraft(seeded);
    setErrorMessage(null);
    setEditingSection("naesin");
  }

  function startEditingMock() {
    const normalized = normalizeStoredMock(student.mockInput);
    const seeded = buildInitialState(
      normalized ? { mockExam: normalized } : null,
    ).mockExam;
    setMockDraft(seeded);
    setErrorMessage(null);
    setEditingSection("mock");
  }

  function cancelEditing() {
    setEditingSection(null);
    setErrorMessage(null);
  }

  // ── 내신 draft setter — GoalOnboardingContext.setNaesin*와 같은 규칙(round2
  // 자동 평균 포함) ─────────────────────────────────────────────────────────
  function setNaesinLastExam(key: string) {
    setNaesinDraft((prev) => (prev ? { ...prev, lastExam: key } : prev));
  }
  function setNaesinOverall(value: string) {
    setNaesinDraft((prev) => (prev ? { ...prev, overall: value } : prev));
  }
  function setPriorNaesinGrade(value: string) {
    setNaesinDraft((prev) =>
      prev ? { ...prev, priorNaesinGrade: value } : prev,
    );
  }
  function setNaesinGroupAvg(examKey: string, groupKey: string, avg: string) {
    setNaesinDraft((prev) => {
      if (!prev) return prev;
      const exam = prev.exams[examKey];
      if (!exam) return prev;
      const group = exam.groups[groupKey];
      if (!group) return prev;
      return {
        ...prev,
        exams: {
          ...prev.exams,
          [examKey]: {
            groups: { ...exam.groups, [groupKey]: { ...group, avg } },
          },
        },
      };
    });
  }
  function setNaesinGroupSubjects(
    examKey: string,
    groupKey: string,
    subjects: { name: string; grade: string }[],
  ) {
    setNaesinDraft((prev) => {
      if (!prev) return prev;
      const exam = prev.exams[examKey];
      if (!exam) return prev;
      const group = exam.groups[groupKey];
      if (!group) return prev;
      const validGrades = subjects
        .map((subject) => Number(subject.grade))
        .filter((num) => Number.isFinite(num) && num >= 1 && num <= 9);
      const avg =
        validGrades.length > 0
          ? String(
              Math.round(
                (validGrades.reduce((a, b) => a + b, 0) / validGrades.length) *
                  100,
              ) / 100,
            )
          : "";
      return {
        ...prev,
        exams: {
          ...prev.exams,
          [examKey]: {
            groups: { ...exam.groups, [groupKey]: { subjects, avg } },
          },
        },
      };
    });
  }

  // ── 모의고사 draft setter — GoalOnboardingContext.setMock*/updateMockSubject와
  // 같은 규칙 ─────────────────────────────────────────────────────────────
  function setMockLastRound(key: string) {
    setMockDraft((prev) => (prev ? { ...prev, lastRound: key } : prev));
  }
  function setMockTrack(track: "과탐" | "사탐") {
    setMockDraft((prev) => (prev ? { ...prev, track } : prev));
  }
  function updateMockSubject(
    roundKey: string,
    subjectKey: "kor" | "math" | "tam1" | "tam2",
    patch: { grade?: string; pct?: string },
  ) {
    setMockDraft((prev) => {
      if (!prev) return prev;
      const round = prev.rounds[roundKey];
      if (!round) return prev;
      return {
        ...prev,
        rounds: {
          ...prev.rounds,
          [roundKey]: {
            ...round,
            [subjectKey]: { ...round[subjectKey], ...patch },
          },
        },
      };
    });
  }
  function setMockEnglishGrade(roundKey: string, grade: string) {
    setMockDraft((prev) => {
      if (!prev) return prev;
      const round = prev.rounds[roundKey];
      if (!round) return prev;
      return {
        ...prev,
        rounds: { ...prev.rounds, [roundKey]: { ...round, eng: { grade } } },
      };
    });
  }

  async function saveNaesin() {
    if (!naesinDraft) return;
    setSaving(true);
    setErrorMessage(null);
    const submitResult = await submitGoalIntakeUpdate({
      section: "naesin",
      naesin: {
        ...naesinDraft,
        exams: buildNaesinExamsPayload(naesinDraft.lastExam, naesinDraft.exams),
      },
    });
    setSaving(false);
    if (submitResult.kind === "success") {
      await queryClient.invalidateQueries({ queryKey: ["goal", "student"] });
      setEditingSection(null);
      return;
    }
    setErrorMessage(updateErrorMessage(submitResult));
  }

  async function saveMock() {
    if (!mockDraft) return;
    setSaving(true);
    setErrorMessage(null);
    const submitResult = await submitGoalIntakeUpdate({
      section: "mock",
      mockExam: {
        ...mockDraft,
        rounds: buildMockRoundsPayload(mockDraft.lastRound, mockDraft.rounds),
      },
    });
    setSaving(false);
    if (submitResult.kind === "success") {
      await queryClient.invalidateQueries({ queryKey: ["goal", "student"] });
      setEditingSection(null);
      return;
    }
    setErrorMessage(updateErrorMessage(submitResult));
  }

  const naesinCanSave = naesinDraft
    ? isNaesinInputValid(wireGrade, naesinDraft)
    : false;
  const mockCanSave = mockDraft
    ? isMockExamInputValid(wireGrade, mockDraft)
    : false;

  return (
    <>
      <GoalPageHeader
        title="내 정보 수정"
        subcopy="학생 정보와 목표 설정을 관리합니다."
      />
      <div className="max-w-goal-content flex flex-col gap-5 px-4 pb-24 md:px-12">
        <GoalCard tone="neutral" className="flex flex-col gap-4 px-8 py-7">
          <div className="flex items-center justify-between">
            <h3 className="text-app-card-title font-bold text-ink-strong">
              내신 성적
            </h3>
            {editingSection !== "naesin" && (
              <button
                type="button"
                onClick={startEditingNaesin}
                className="h-8.5 rounded-lg border border-line px-4 text-app-label font-medium text-ink-strong transition-colors hover:bg-surface-04"
              >
                수정
              </button>
            )}
          </div>

          {editingSection === "naesin" && naesinDraft ? (
            <>
              <NaesinScoreFields
                grade={wireGrade}
                naesin={naesinDraft}
                onLastExamChange={setNaesinLastExam}
                onOverallChange={setNaesinOverall}
                onPriorNaesinGradeChange={setPriorNaesinGrade}
                onGroupAvgChange={setNaesinGroupAvg}
                onGroupSubjectsChange={setNaesinGroupSubjects}
              />
              {errorMessage && (
                <p className="text-app-label text-red-500">{errorMessage}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="h-9.75 rounded-lg border border-line px-5 text-app-label font-medium text-ink-sub transition-colors hover:bg-surface-04"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={!naesinCanSave || saving}
                  onClick={saveNaesin}
                  className="h-9.75 rounded-lg bg-[#2E2A26] px-5 text-app-label font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-surface-01 disabled:text-ink-sub"
                >
                  {saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </>
          ) : student.scores.lastNaesinExam ? (
            <p className="text-app-body text-ink">
              최근 시험: {student.scores.lastNaesinExam} · 평균{" "}
              {student.scores.convertedGrade}등급
            </p>
          ) : (
            <p className="text-app-body text-ink-sub">
              아직 입력한 내신 성적이 없습니다.
            </p>
          )}
        </GoalCard>

        <GoalCard tone="neutral" className="flex flex-col gap-4 px-8 py-7">
          <div className="flex items-center justify-between">
            <h3 className="text-app-card-title font-bold text-ink-strong">
              모의고사 성적
            </h3>
            {editingSection !== "mock" && (
              <button
                type="button"
                onClick={startEditingMock}
                className="h-8.5 rounded-lg border border-line px-4 text-app-label font-medium text-ink-strong transition-colors hover:bg-surface-04"
              >
                수정
              </button>
            )}
          </div>

          {editingSection === "mock" && mockDraft ? (
            <>
              <MockExamScoreFields
                grade={wireGrade}
                mockExam={mockDraft}
                onLastRoundChange={setMockLastRound}
                onTrackChange={setMockTrack}
                onSubjectChange={updateMockSubject}
                onEnglishGradeChange={setMockEnglishGrade}
              />
              {errorMessage && (
                <p className="text-app-label text-red-500">{errorMessage}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="h-9.75 rounded-lg border border-line px-5 text-app-label font-medium text-ink-sub transition-colors hover:bg-surface-04"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={!mockCanSave || saving}
                  onClick={saveMock}
                  className="h-9.75 rounded-lg bg-[#2E2A26] px-5 text-app-label font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-surface-01 disabled:text-ink-sub"
                >
                  {saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </>
          ) : student.scores.lastMogoExam ? (
            <p className="text-app-body text-ink">
              최근 회차: {student.scores.lastMogoExam} · 종합 백분위{" "}
              {student.scores.currentMogo}
            </p>
          ) : (
            <p className="text-app-body text-ink-sub">
              아직 입력한 모의고사 성적이 없습니다.
            </p>
          )}
        </GoalCard>
      </div>
    </>
  );
}
