import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import {
  ChildGrowthError,
  ChildGrowthLoading,
  ChildGrowthNotLinked,
  ChildGrowthShell,
} from "@/components/growth/parent/ChildGrowthShell";
import ChildReportCard from "@/components/growth/parent/ChildReportCard";
import {
  childReportsQuery,
  isNotLinked,
} from "@/components/growth/parent/childQueries";
import { useParentChild } from "@/components/growth/parent/useParentChild";
import { sortReportItems } from "@/components/growth/reports/reportsLogic";
import { useAuth } from "@/context/AuthProvider";

// 학부모가 자녀의 성장설계 리포트 완료 회차 목록을 여는 화면.
// 진입: 알림톡 "리포트 보기" 링크(/mypage/children/:childId/growth).
// 회원유형과 자녀 연결 판정은 여기서 한다(useParentChild). 서버가 한 번 더 확인한다(403 NOT_LINKED).
export default function ChildGrowthReports() {
  const { childId } = useParams();
  const { userId } = useAuth();
  const gate = useParentChild(childId);
  const linked = gate.status === "linked";

  const query = useQuery({
    ...childReportsQuery(userId, childId),
    enabled: linked && !!userId && !!childId,
  });

  if (gate.status === "loading") return <ChildGrowthLoading />;
  if (gate.status === "not-linked" || isNotLinked(query.error)) {
    return <ChildGrowthNotLinked />;
  }

  const name = query.data?.child.name ?? gate.childName;
  const items = query.data ? sortReportItems(query.data.items) : [];

  return (
    <ChildGrowthShell>
      <Link
        to="/mypage?tab=children"
        className="text-app-label font-medium text-ink-sub underline underline-offset-4 transition hover:text-ink"
      >
        ← 자녀 목록
      </Link>
      <h1 className="mt-4 text-app-title font-semibold text-ink">
        {name} 학생의 성장설계 리포트
      </h1>

      <div className="mt-6">
        {query.isError ? (
          <ChildGrowthError onRetry={() => query.refetch()} />
        ) : !query.data ? (
          <p aria-busy="true" className="text-app-body text-ink-sub">
            목록을 불러오는 중이에요.
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-border bg-white p-6 text-app-body text-ink-sub">
            아직 완료한 리포트가 없어요
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <ChildReportCard
                key={item.id}
                childId={query.data.child.id}
                item={item}
              />
            ))}
          </ul>
        )}
      </div>
    </ChildGrowthShell>
  );
}
