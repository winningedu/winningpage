import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useGrowthScreenStep } from "@/components/growth/GrowthShellContext";
import { GROWTH_PATHS } from "@/components/growth/growthPaths";
import ReportBody from "@/components/growth/report/ReportBody";
import { normalizeNarrative } from "@/components/growth/report/reportLogic";
import { growthReportDetailQuery } from "@/components/growth/report/reportQuery";
import { formatKoreanDate } from "@/components/growth/reports/reportsLogic";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { GrowthApiError } from "@/lib/growth/queries";
import { cn } from "@/lib/utils";

const DEFAULT_TITLE = "성장설계 리포트";

// 경로: /app/growth/reports/:reportId (진행단계 5, 리포트)
export default function ReportPage() {
  useGrowthScreenStep(5);
  const { userId } = useSession();
  const { reportId } = useParams();
  const { data, error, isError, refetch } = useQuery(
    growthReportDetailQuery(userId ?? null, reportId),
  );

  if (error instanceof GrowthApiError && error.result.kind === "error") {
    if (error.result.code === "REPORT_NOT_COMPLETED")
      return <Navigate to={GROWTH_PATHS.generate} replace />;
    if (error.result.status === 404)
      return <Navigate to={GROWTH_PATHS.reports} replace />;
  }

  const report = data?.report;
  const issued = report ? formatKoreanDate(report.issuedAt) : "";
  const subcopy = [
    issued ? `${issued} 발행` : "",
    report?.range?.description ?? "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <GoalPageHeader
        title={normalizeNarrative(report?.narrative)?.theme ?? DEFAULT_TITLE}
        subcopy={subcopy || undefined}
        actions={
          <>
            <Link
              to={GROWTH_PATHS.reports}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-10 px-5 text-app-label",
              )}
            >
              지난 리포트
            </Link>
            <Link
              to={GROWTH_PATHS.plan}
              className={cn(buttonVariants(), "h-10 px-5 text-app-label")}
            >
              실행계획 보기
            </Link>
          </>
        }
      />
      <div className="mx-auto w-full max-w-[83.75rem] px-12 pb-12">
        {isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-xl border border-border bg-white p-6"
          >
            <p className="text-app-body text-ink-strong">
              리포트를 불러오지 못했어요.
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              다시 시도
            </Button>
          </div>
        ) : !data ? (
          <div aria-busy="true" className="flex flex-col gap-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <ReportBody detail={data} />
            <div className="mt-8 flex justify-center">
              <Link
                to={GROWTH_PATHS.plan}
                className={cn(buttonVariants(), "h-12 px-8 text-app-body")}
              >
                실행계획 보기
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
