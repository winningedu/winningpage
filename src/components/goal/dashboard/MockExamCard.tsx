import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import DeltaBadge from "@/components/goal/DeltaBadge";
import GoalCard from "@/components/goal/GoalCard";
import GoalCardHeader from "@/components/goal/GoalCardHeader";
import GoalDdayBadge from "@/components/goal/GoalDdayBadge";
import GoalStatChip from "@/components/goal/GoalStatChip";
import AddMockExamGradeModal from "@/components/goal/modals/AddMockExamGradeModal";
import { addGoalGrade, fetchGoalGrades } from "@/lib/goalApi";
import { recentHistory } from "@/lib/goalGrades";
import { goalNotAllowedMessage } from "@/lib/tenantBlock";

// "모의고사" 카드(530×364 = 33.125rem×22.75rem, part-07 #20 정본 기준). 저장 후에는
// 4022:5403 변형으로 전환된다 — 하단이 "학습 조언"에서 "기록한 성적"(최근 3건, 회차/백분위/
// 전회 대비 증감) 표로 바뀐다. 두 상태가 공존하지 않는다는 시안 특이사항(4022-5403 문서
// #2 "기록 있으면 이력, 없으면 조언 분기 필요")을 그대로 분기 조건으로 채택했다.
//
// records는 이 위젯이 스스로 불러온다(모달 오픈 상태와 같은 이유 — 부모 Dashboard로
// 끌어올리지 않는다). Dashboard.jsx가 이미 fetchGoalStudent()를 한 번 부르지만 그 응답에는
// 회차별 기록이 없다(goal_students 원본 컬럼이 아니라 grades.js가 파생한 값이라서) — 별도
// 조회가 불가피하다.
type MockExamCardData = {
  round: string;
  dday?: string | number;
  metricLabel: string;
  metricValue: ReactNode;
  // QA 행295·306 — 과목별 조언 데이터 소스가 없어(Dashboard.tsx mapMockExam) 옵셔널로
  // 두고, 없으면 "학습 조언" 블록 자체를 렌더하지 않는다(no-fallback-constants).
  advice?: string;
};

// api/_routes/goal/grades.js 회차 기록 — mockRecords 원소. recentHistory()가 delta 를 파생시켜 붙인다.
// (index signature 대신 실제 쓰는 필드만 선언 — goalApi.ts 의 GoalGradeRecord 는 index
// signature 가 없어 구조적 할당 시 인덱스 시그니처 요구가 오히려 막힌다, 판단 지점)
type MockGradeRecord = {
  term: string;
  value: number;
  delta?: number | null;
};

type MockExamCardProps = {
  data: MockExamCardData;
};

// onSubmit이 반환하는 저장 결과 — AddMockExamGradeModal의 onSubmit 계약과 동일.
type SubmitOutcome = { ok: boolean; detail?: string };

export default function MockExamCard({ data }: MockExamCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [records, setRecords] = useState<MockGradeRecord[] | null>(null); // null = 로딩 중

  useEffect(() => {
    let alive = true;
    fetchGoalGrades().then((result) => {
      if (!alive) return;
      setRecords(result.kind === "ok" ? result.mockRecords : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(entry: {
    term: string;
    examDate?: string;
    subjects: Record<string, string>;
  }): Promise<SubmitOutcome> {
    // addGoalGrade의 JSDoc 계약은 subjects 4과목 키를 명시하지만, 이 모달이 실제로 넘기는
    // scores는 항상 그 4키를 가진 Record<string,string>이다(AddMockExamGradeModal.tsx SUBJECTS
    // 참고) — 형태는 같고 TS 표현만 다르다.
    const result = await addGoalGrade(
      "mock",
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
    setRecords(result.records);
    return { ok: true };
  }

  const history = recentHistory(records, 3);

  return (
    <GoalCard tone="neutral" className="flex h-full flex-col gap-5 px-8 py-7">
      <GoalCardHeader
        title="모의고사"
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
      <div className="flex items-center gap-3">
        <span className="text-app-card-title font-semibold text-ink-strong">
          {data.round}
        </span>
        <GoalDdayBadge dday={data.dday ?? null} />
      </div>
      <GoalStatChip
        label={data.metricLabel}
        value={data.metricValue}
        tone="blue"
      />

      {history.length > 0 ? (
        <div className="mt-auto flex flex-col gap-2">
          <p className="text-app-body font-bold leading-[1.4] text-ink-strong">
            기록한 성적
          </p>
          <div className="flex flex-col gap-2">
            {history.map((record) => (
              <div
                key={record.term}
                className="flex items-center justify-between text-app-label text-ink"
              >
                <span className="text-ink-strong">{record.term}</span>
                <div className="flex items-center gap-2">
                  <span>{record.value}</span>
                  {record.delta != null ? (
                    <DeltaBadge
                      value={`${record.delta > 0 ? "+" : ""}${record.delta}`}
                      direction={record.delta >= 0 ? "up" : "down"}
                      tone={record.delta >= 0 ? "positive" : "negative"}
                    />
                  ) : (
                    <span className="text-ink-sub">-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        data.advice && (
          <div className="mt-auto flex flex-col gap-2">
            <p className="text-app-body font-bold leading-[1.4] text-ink-strong">
              학습 조언
            </p>
            <p className="text-app-body leading-normal text-ink">
              {data.advice}
            </p>
          </div>
        )
      )}

      <AddMockExamGradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </GoalCard>
  );
}
