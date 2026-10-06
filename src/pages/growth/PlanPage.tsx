import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useGrowthScreenStep } from "@/components/growth/GrowthShellContext";
import { GROWTH_PATHS } from "@/components/growth/growthPaths";
import PlanView from "@/components/growth/plan/PlanView";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { GrowthApiError, growthPlanQuery } from "@/lib/growth/queries";

// 경로: /app/growth/plan (진행단계 6, 최신 완료 회차의 실행계획)
export default function PlanPage() {
  useGrowthScreenStep(6);
  const { userId } = useSession();
  const { data, error, isPending, isError, refetch } = useQuery(
    growthPlanQuery(userId ?? null),
  );

  const notFound =
    error instanceof GrowthApiError &&
    error.result.kind === "error" &&
    error.result.code === "PLAN_NOT_FOUND";

  return (
    <>
      <GoalPageHeader
        title="실행계획"
        subcopy="리포트 3부의 활동을 시기별로 놓았어요. 하면 체크하세요."
      />
      <div className="mx-auto w-full max-w-[83.75rem] px-12 pb-12">
        {notFound ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-white p-6">
            <p className="text-app-body text-ink-strong">
              완료한 리포트가 없어요
            </p>
            <Link to={GROWTH_PATHS.home} className={buttonVariants()}>
              시작하기
            </Link>
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-xl border border-border bg-white p-6"
          >
            <p className="text-app-body text-ink-strong">
              실행계획을 불러오지 못했어요.
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              다시 시도
            </Button>
          </div>
        ) : isPending || !data ? (
          <div aria-busy="true" className="flex flex-col gap-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : (
          <PlanView plan={data.plan} userId={userId ?? null} />
        )}
      </div>
    </>
  );
}
