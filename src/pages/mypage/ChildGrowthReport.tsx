import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import {
  ChildGrowthError,
  ChildGrowthLoading,
  ChildGrowthNotLinked,
  ChildGrowthShell,
} from "@/components/growth/parent/ChildGrowthShell";
import ChildPlanList from "@/components/growth/parent/ChildPlanList";
import {
  childReportDetailQuery,
  isNotFound,
  isNotLinked,
} from "@/components/growth/parent/childQueries";
import { useParentChild } from "@/components/growth/parent/useParentChild";
import ReportBody from "@/components/growth/report/ReportBody";
import { formatKoreanDate } from "@/components/growth/reports/reportsLogic";
import { useAuth } from "@/context/AuthProvider";

// 학부모가 자녀의 성장설계 리포트 한 회차를 여는 화면(/mypage/children/:childId/growth/:reportId).
// 본문은 학생 화면의 ReportBody 를 parentView 로 재사용한다. 성적 민감 섹션은 서버가 빼고,
// 제외 안내 문구는 ReportBody 가 excludedSectionIds 로 띄운다. 실행계획은 읽기 전용이다.
export default function ChildGrowthReport() {
  const { childId, reportId } = useParams();
  const { userId } = useAuth();
  const gate = useParentChild(childId);
  const linked = gate.status === "linked";
  const listPath = `/mypage/children/${childId}/growth`;

  const query = useQuery({
    ...childReportDetailQuery(userId, childId, reportId),
    enabled: linked && !!userId && !!childId && !!reportId,
  });

  if (gate.status === "loading") return <ChildGrowthLoading />;
  if (gate.status === "not-linked" || isNotLinked(query.error)) {
    return <ChildGrowthNotLinked />;
  }

  const report = query.data?.report;
  const issued = report ? formatKoreanDate(report.issuedAt) : "";

  return (
    <ChildGrowthShell>
      <Link
        to={listPath}
        className="text-app-label font-medium text-ink-sub underline underline-offset-4 transition hover:text-ink"
      >
        ← 목록으로
      </Link>
      <h1 className="mt-4 text-app-title font-semibold text-ink">
        {gate.childName} 학생의 성장설계 리포트
      </h1>
      {issued ? (
        <p className="mt-1 text-app-label text-ink-sub">{issued} 발행</p>
      ) : null}

      <div className="mt-6">
        {isNotFound(query.error) ? (
          <p
            role="alert"
            className="rounded-xl border border-border bg-white p-6 text-app-body text-ink-sub"
          >
            리포트를 찾을 수 없어요.
          </p>
        ) : query.isError ? (
          <ChildGrowthError onRetry={() => query.refetch()} />
        ) : !query.data ? (
          <p aria-busy="true" className="text-app-body text-ink-sub">
            리포트를 불러오는 중이에요.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <ReportBody detail={query.data} parentView />
            <ChildPlanList items={query.data.report.planItems} />
          </div>
        )}
      </div>
    </ChildGrowthShell>
  );
}
