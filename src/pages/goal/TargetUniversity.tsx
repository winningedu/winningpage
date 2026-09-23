import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import AppModal from "@/components/goal/AppModal";
import GoalCard from "@/components/goal/GoalCard";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import UniversitySelect from "@/components/goal/onboarding/UniversitySelect";
import GapToTargetCard from "@/components/goal/study/GapToTargetCard";
import TargetUniversityCard from "@/components/goal/study/TargetUniversityCard";
import { useAuth } from "@/context/AuthProvider";
import { buildGapRows, buildZoneGapRows } from "@/lib/goal/gapToTarget";
import { mapTargetUniversities } from "@/lib/goal/targetUniversities";
import type { GoalStudentPayload } from "@/lib/goalApi";
import { submitGoalIntakeUpdate } from "@/lib/goalApi";
import { goalStudentQueryOptions } from "@/lib/queryClient";

// 내 목표 대학(#24) — 이상/최소 목표 대학 2카드(680×348) + "목표까지 남은 격차" 행들.
// 대시보드 우측 레일과 같은 mapTargetUniversities()(src/lib/goal/targetUniversities.ts)로
// 상단 카드를 만든다(기획서 §3.16 실산출 전환, 2026-08-20 — 이전엔 GapToTargetCard를
// 렌더에서 뺐다).
//
// QA 행295(3구간 확장) 이후: 내신·모의고사는 buildZoneGapRows()로 최소/이상 두 컷을
// 함께 보여준다 — 더 이상 "이상 목표 한 기준"이 아니라서 기존 meta="이상 목표 기준"
// 문구는 뗀다(축마다 자기 컷을 행 설명에 직접 담는다). 학습 시간은 대학 컷이 아니라
// 학생 자신의 주간 목표 시간이라 min/ideal 이원 구조가 없다(gapToTarget.ts 주석 참고)
// — 기존 buildGapRows()를 그대로 재사용해 학습 시간 행만 뽑고 zone 행 뒤에 잇는다
// (2구간 studyGap 로직을 3구간용으로 다시 만들지 않는다).
//
// 편집(QA 2차 시트 행25) — 시안(#24)에는 편집 버튼·모달이 없었지만(part-08 §331
// "별도 확정 필요") 수정할 방법 자체가 없다는 QA 지적으로 이번에 추가한다. "변경"
// 버튼 → 온보딩과 같은 UniversitySelect 2개(이상/최소) 인라인 편집 → 저장 전
// AppModal 확인 → POST /api/goal/intake-update(section:"target").

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

export default function TargetUniversity() {
  // ['goal','student', userId] 쿼리 캐시(src/lib/queryClient.ts)를 그대로 구독한다 —
  // goal 진입 시 미들웨어·Dashboard.tsx가 이미 채워둔 응답을 재사용해 이 페이지
  // 전용 재요청을 없앤다(명세 B-3 §5). 캐시 키의 userId는 리뷰 C1. RequireGoalAccess가
  // 이미 onboarded:true만 통과시키므로 정상 경로에선 kind는 항상 'onboarded'다 —
  // 그 외 kind는 Dashboard.jsx와 동일하게 방어적 분기다. isPending 동안은 로딩 중과
  // 동일하게 result === null로 취급한다.
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const goalStudentQuery = useQuery(goalStudentQueryOptions(userId));
  const result = goalStudentQuery.isPending
    ? null
    : ((goalStudentQuery.data as GoalStudentResult | undefined) ?? null);

  const [editing, setEditing] = useState(false);
  const [draftIdeal, setDraftIdeal] = useState({
    university: "",
    department: "",
  });
  const [draftMin, setDraftMin] = useState({ university: "", department: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (result === null || result.kind !== "onboarded") {
    const message =
      result?.kind === "awaiting-cuts"
        ? "합격 기준 데이터를 준비 중입니다. 잠시 후 다시 확인해 주세요."
        : result === null
          ? "목표 대학 정보를 불러오는 중입니다…"
          : "목표 대학 정보를 불러오지 못했습니다. 새로고침해 주세요.";
    return (
      <>
        <GoalPageHeader
          title="내 목표 대학"
          subcopy="이상 목표와 최소 목표를 이원으로 관리합니다. 목표를 바꾸면 격차 분석과 학습 시간이 다시 계산돼요."
        />
        <div className="max-w-goal-content flex flex-col gap-5 px-4 pb-24 md:px-12">
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
  const { upper, lower } = mapTargetUniversities(student);

  // 내신·모의고사 — 최소/이상 목표 대학의 컷을 함께 넘겨 3구간으로 가른다.
  const zoneGapRows = buildZoneGapRows({
    naesin: {
      current: student.scores.convertedGrade,
      min: student.targets.min.naesinCut,
      ideal: student.targets.ideal.naesinCut,
    },
    mogo: {
      current: student.scores.currentMogo,
      min: student.targets.min.jungsiCut,
      ideal: student.targets.ideal.jungsiCut,
    },
  });
  // 학습 시간 — 대학 컷이 없는 축이라 기존 2구간 buildGapRows에서 그 행만 뽑는다
  // (naesin/mogo는 null을 넘겨 행을 만들지 않는다).
  const studyGapRows = buildGapRows({
    naesin: { current: null, target: null },
    mogo: { current: null, target: null },
    study: {
      current: student.recentAvgStudyHours,
      // weekIdeal은 주간 목표 시간(요일별 합) — 일일 목표는 7로 나눠 근사한다.
      target: student.weekIdeal > 0 ? student.weekIdeal / 7 : null,
    },
  });
  const gapRows = [...zoneGapRows, ...studyGapRows];

  function startEditing() {
    setDraftIdeal(student.targetInput.ideal);
    setDraftMin(student.targetInput.min);
    setErrorMessage(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setConfirmOpen(false);
    setErrorMessage(null);
  }

  const canSaveDraft =
    !!draftIdeal.university &&
    !!draftIdeal.department &&
    !!draftMin.university &&
    !!draftMin.department;

  async function confirmSave() {
    setSaving(true);
    setErrorMessage(null);
    const submitResult = await submitGoalIntakeUpdate({
      section: "target",
      upperUniversity: draftIdeal,
      lowerUniversity: draftMin,
    });
    setSaving(false);
    setConfirmOpen(false);

    if (submitResult.kind === "success") {
      await queryClient.invalidateQueries({ queryKey: ["goal", "student"] });
      setEditing(false);
      return;
    }

    if (submitResult.kind === "cuts-missing") {
      setErrorMessage(
        "선택한 목표 대학의 합격 기준 데이터가 아직 준비되지 않았습니다.",
      );
      return;
    }
    if (submitResult.kind === "validation-error") {
      setErrorMessage(submitResult.detail || "입력값을 확인해 주세요.");
      return;
    }
    setErrorMessage("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  }

  return (
    <>
      <GoalPageHeader
        title="내 목표 대학"
        subcopy="이상 목표와 최소 목표를 이원으로 관리합니다. 목표를 바꾸면 격차 분석과 학습 시간이 다시 계산돼요."
      />
      <div className="max-w-goal-content flex flex-col gap-5 px-4 pb-24 md:px-12">
        {editing ? (
          <GoalCard tone="neutral" className="flex flex-col gap-6 px-8 py-7">
            <div>
              <p className="mb-2 text-app-label font-semibold text-ink-strong">
                이상 목표 대학
              </p>
              <UniversitySelect
                target="upper"
                value={draftIdeal}
                onChange={(partial) =>
                  setDraftIdeal((prev) => ({ ...prev, ...partial }))
                }
              />
            </div>
            <div>
              <p className="mb-2 text-app-label font-semibold text-ink-strong">
                최소 목표 대학
              </p>
              <UniversitySelect
                target="lower"
                value={draftMin}
                onChange={(partial) =>
                  setDraftMin((prev) => ({ ...prev, ...partial }))
                }
              />
            </div>
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
                disabled={!canSaveDraft}
                onClick={() => setConfirmOpen(true)}
                className="h-9.75 rounded-lg bg-[#2E2A26] px-5 text-app-label font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-surface-01 disabled:text-ink-sub"
              >
                저장
              </button>
            </div>
          </GoalCard>
        ) : (
          <>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={startEditing}
                className="h-9.75 rounded-lg border border-line px-5 text-app-label font-medium text-ink-strong transition-colors hover:bg-surface-04"
              >
                변경
              </button>
            </div>
            <div className="grid grid-cols-2 gap-5">
              <TargetUniversityCard
                label={upper.label}
                university={upper.university}
                department={upper.department}
                susiRate={upper.susiRate}
                jeongsiRate={upper.jeongsiRate}
                jungsiAvailable={upper.jungsiAvailable}
              />
              <TargetUniversityCard
                label={lower.label}
                university={lower.university}
                department={lower.department}
                susiRate={lower.susiRate}
                jeongsiRate={lower.jeongsiRate}
                jungsiAvailable={lower.jungsiAvailable}
              />
            </div>
            {/* 전 축이 산출 불가면(온보딩 직후 등) 두 빌더가 모두 빈 배열을 돌려주고,
                카드 자체를 숨긴다 — 빈 카드로 억지 렌더하지 않는다. */}
            {gapRows.length > 0 && <GapToTargetCard rows={gapRows} />}
          </>
        )}
      </div>

      <AppModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="목표 대학을 변경할까요?"
        subtitle="목표대학을 변경하면 기존의 학습 data 반영이 새롭게 적용됩니다."
        cancelLabel="취소"
        onCancel={() => setConfirmOpen(false)}
        submitLabel={saving ? "저장 중…" : "변경"}
        submitDisabled={saving}
        onSubmit={confirmSave}
      />
    </>
  );
}
