import { useQuery } from "@tanstack/react-query";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useGrowthScreenStep } from "@/components/growth/GrowthShellContext";
import ReportsView from "@/components/growth/reports/ReportsView";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { growthReportsQuery } from "@/lib/growth/queries";

// 경로: /app/growth/reports (단계 밖 화면이라 null)
export default function ReportsPage() {
  useGrowthScreenStep(null);
  const { userId } = useSession();
  const { data, isPending, isError, refetch } = useQuery(
    growthReportsQuery(userId ?? null),
  );

  return (
    <>
      <GoalPageHeader
        title="지난 리포트"
        subcopy="발행한 리포트를 다시 열 수 있어요."
      />
      <div className="mx-auto w-full max-w-[83.75rem] px-12 pb-12">
        {isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-xl border border-border bg-white p-6"
          >
            <p className="text-app-body text-ink-strong">
              리포트 목록을 불러오지 못했어요.
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              다시 시도
            </Button>
          </div>
        ) : isPending || !data ? (
          <div aria-busy="true" className="flex flex-col gap-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <ReportsView data={data} />
        )}
      </div>
    </>
  );
}
