import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import EvaluationBody from "@/components/inquiry/evaluate/EvaluationBody";
import { remainingReevaluations } from "@/components/inquiry/evaluate/evaluateLogic";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import {
  useInquiryScreenStep,
  useInquiryShell,
} from "@/components/inquiry/InquiryShellContext";
import StepGate from "@/components/inquiry/StepGate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { MAX_EVALUATIONS } from "@/lib/inquiry/labels";
import { inquirySessionDetailQuery } from "@/lib/inquiry/queries";
import { cn } from "@/lib/utils";

const SUBCOPY =
  "점수를 매기는 것보다 어디를 어떻게 고칠지 알려 주는 것이 목적이에요.";
const MAX_REEVALUATIONS = MAX_EVALUATIONS - 1;

// 평가 본문은 StepGate 가드를 통과한 뒤에만 그려 세션이 확정된 상태에서만 조회한다.
function EvaluateContent() {
  const { userId } = useSession();
  const { session } = useInquiryShell();
  const sessionId = session?.id ?? null;
  const { data, isPending, isError, refetch } = useQuery(
    inquirySessionDetailQuery(userId ?? null, sessionId),
  );

  if (isPending && !isError) {
    return (
      <div role="status" aria-label="불러오는 중">
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (isError || !data?.evaluation) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-border bg-white p-6"
      >
        <p className="text-app-body text-ink-strong">
          평가 리포트를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          다시 불러오기
        </Button>
      </div>
    );
  }

  const remaining = remainingReevaluations(data.session.evaluationCount);
  return (
    <>
      <EvaluationBody evaluation={data.evaluation} />
      <p className="text-app-label text-ink-sub">
        {remaining > 0
          ? "다시 평가하려면 작성 화면에서 고친 뒤 제출해요."
          : "재평가를 모두 사용했어요. 이 평가로 확정하거나 작성 화면에서 내용을 확인해 주세요."}{" "}
        남은 재평가 {remaining} / {MAX_REEVALUATIONS}
      </p>
      <div className="flex justify-end gap-3">
        <Link
          to={INQUIRY_PATHS.write}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 px-5")}
        >
          작성 화면으로 돌아가기
        </Link>
        <Link
          to={INQUIRY_PATHS.finalize}
          className={cn(buttonVariants(), "h-10 px-5")}
        >
          확정하고 적립하기
        </Link>
      </div>
    </>
  );
}

export default function EvaluatePage() {
  useInquiryScreenStep(5);
  return (
    <StepGate step={5} title="평가 리포트" subcopy={SUBCOPY}>
      <EvaluateContent />
    </StepGate>
  );
}
