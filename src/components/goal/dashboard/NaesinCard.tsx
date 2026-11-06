import type { ReactNode } from "react";
import { useState } from "react";
import GoalCard from "@/components/goal/GoalCard";
import GoalCardHeader from "@/components/goal/GoalCardHeader";
import GoalStatChip from "@/components/goal/GoalStatChip";
import AddNaesinGradeModal from "@/components/goal/modals/AddNaesinGradeModal";
import { addGoalGrade } from "@/lib/goalApi";
import { goalNotAllowedMessage } from "@/lib/tenantBlock";

type NaesinCardData = {
  round: string;
  metricLabel: string;
  metricValue: ReactNode;
  // QA 행295·306 — 과목별 조언 데이터 소스가 없어(Dashboard.tsx mapNaesin) 옵셔널로
  // 두고, 없으면 "학습 조언" 블록 자체를 렌더하지 않는다(no-fallback-constants).
  advice?: string;
};

type NaesinCardProps = {
  data: NaesinCardData;
};

type SubmitOutcome = { ok: boolean; detail?: string };

// "내신" 카드(530×364, part-07 #20 정본 기준) — 모의고사 카드와 짝을 이루는 2열 레이아웃.
// #20 카피 전문에는 내신 카드에 D-day가 없다 — mapNaesin()도 dday를 만들지 않고, 이
// 컴포넌트도 의도적으로 렌더하지 않는다(모의고사 카드는 dday를 렌더하는 것과 비대칭).
//
// 저장 후에도 "학습 조언" 블록을 유지한다(모의고사 카드와 달리 "기록한 성적" 이력으로
// 전환하지 않는다) — 4022:5403 시안이 모의고사 카드만 변형하고 내신 카드는 그대로 두는
// 비대칭 그대로다(작업 지시 "내신 카드는 조언 유지"). 따라서 이 카드는 회차 기록을 따로
// 조회하지 않는다 — 저장 결과를 반영할 화면 요소가 없다(모달만 닫힌다).
export default function NaesinCard({ data }: NaesinCardProps) {
  const [modalOpen, setModalOpen] = useState(false);

  async function handleSubmit(entry: {
    term: string;
    enteredAt?: string;
    subjects: Record<string, string>;
  }): Promise<SubmitOutcome> {
    // addGoalGrade의 JSDoc 계약은 subjects 4과목 키를 명시하지만, 이 모달이 실제로 넘기는
    // grades는 항상 그 4키를 가진 Record<string,string>이다(AddNaesinGradeModal.tsx SUBJECTS
    // 참고) — 형태는 같고 TS 표현만 다르다.
    const result = await addGoalGrade(
      "naesin",
      entry as unknown as Parameters<typeof addGoalGrade>[1],
    );
    if (result.kind !== "success") {
      const detail =
        result.kind === "validation-error"
          ? result.detail
          : result.kind === "not-allowed"
            ? goalNotAllowedMessage(result.tenantReason, "이용권이 필요합니다.")
            : "저장에 실패했습니다. 다시 시도해 주세요.";
      return { ok: false, detail };
    }
    return { ok: true };
  }

  return (
    <GoalCard tone="neutral" className="flex h-full flex-col gap-5 px-8 py-7">
      <GoalCardHeader
        title="내신"
        action={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-app-label font-medium text-primary"
          >
            + 성적 추가
          </button>
        }
      />
      <span className="text-app-card-title font-semibold text-ink-strong">
        {data.round}
      </span>
      <GoalStatChip
        label={data.metricLabel}
        value={data.metricValue}
        tone="purple"
      />
      {data.advice && (
        <div className="mt-auto flex flex-col gap-2">
          <p className="text-app-body font-bold leading-[1.4] text-ink-strong">
            학습 조언
          </p>
          <p className="text-app-body leading-normal text-ink">{data.advice}</p>
        </div>
      )}

      <AddNaesinGradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </GoalCard>
  );
}
