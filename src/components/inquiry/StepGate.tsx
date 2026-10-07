import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useInquiryShell } from "./InquiryShellContext";
import StepGuardCard from "./StepGuardCard";
import { type GuardedStep, guardFor } from "./stepGuards";

// 단계 화면(3~6)의 공통 바깥틀: 페이지 머리와 선행 조건 안내(No.113, 114).
// 선행 조건이 충족되면 children(P6 가 채우는 본문)을 그린다.
export const STEP_BODY_CLASS =
  "flex w-full max-w-goal-content flex-col gap-4 px-4 pb-6 md:px-12";

type StepGateProps = {
  step: GuardedStep;
  title: string;
  subcopy?: string;
  children?: React.ReactNode;
};

export default function StepGate({
  step,
  title,
  subcopy,
  children,
}: StepGateProps) {
  const { session, isBootstrapLoading } = useInquiryShell();
  const guard = isBootstrapLoading ? null : guardFor(step, session);

  return (
    <>
      <GoalPageHeader title={title} subcopy={subcopy} />
      <div className={STEP_BODY_CLASS}>
        {isBootstrapLoading ? (
          <div role="status" aria-label="불러오는 중">
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : guard ? (
          <StepGuardCard {...guard} />
        ) : (
          children
        )}
      </div>
    </>
  );
}
