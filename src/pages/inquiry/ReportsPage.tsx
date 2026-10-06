import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { useInquiryScreenStep } from "@/components/inquiry/InquiryShellContext";
import EmptyReports from "@/components/inquiry/reports/EmptyReports";
import LoadError from "@/components/inquiry/reports/LoadError";
import ReportsFilters from "@/components/inquiry/reports/ReportsFilters";
import ReportsTable from "@/components/inquiry/reports/ReportsTable";
import {
  ALL_SUBJECTS,
  applyFilters,
  buildReportRows,
  type StatusFilter,
  subjectFilterOptions,
} from "@/components/inquiry/reports/reportsLogic";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/context/SessionContext";
import { inquiryReportsQuery } from "@/lib/inquiry/queries";

// 경로: /app/inquiry/reports (단계 밖 화면이라 null)
export default function ReportsPage() {
  useInquiryScreenStep(null);
  const { userId } = useSession();
  const { data, error, isError, refetch } = useQuery(
    inquiryReportsQuery(userId ?? null),
  );
  const [subject, setSubject] = useState(ALL_SUBJECTS);
  const [status, setStatus] = useState<StatusFilter>("all");

  const rows = useMemo(() => (data ? buildReportRows(data) : []), [data]);
  const subjects = useMemo(() => subjectFilterOptions(rows), [rows]);
  const visible = useMemo(
    () => applyFilters(rows, subject, status),
    [rows, subject, status],
  );

  return (
    <>
      <GoalPageHeader
        title="심화탐구 보관함"
        subcopy="지금까지 만든 심화탐구 리포트를 모았어요"
      />
      <div className="mx-auto w-full max-w-[83.75rem] px-12 pb-12">
        {isError ? (
          <LoadError
            error={error}
            message="보관함을 불러오지 못했어요."
            onRetry={() => refetch()}
          />
        ) : !data ? (
          <div aria-busy="true" className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyReports />
        ) : (
          <div className="flex flex-col gap-4">
            <ReportsFilters
              subjects={subjects}
              subject={subject}
              status={status}
              onSubjectChange={setSubject}
              onStatusChange={setStatus}
            />
            <ReportsTable rows={visible} />
          </div>
        )}
      </div>
    </>
  );
}
