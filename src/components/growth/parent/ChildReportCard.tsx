import { Link } from "react-router";
import { formatKoreanDate } from "@/components/growth/reports/reportsLogic";
import type { ReportListItem } from "@/lib/growth/api";

export function childReportPath(childId: string, reportId: string): string {
  return `/mypage/children/${childId}/growth/${reportId}`;
}

/** 완료 회차 카드. 발행일, 트랙, 대주제, 실행계획 진행. */
export default function ChildReportCard({
  childId,
  item,
}: {
  childId: string;
  item: ReportListItem;
}) {
  const issued = formatKoreanDate(item.issuedAt);
  const track = item.track;
  return (
    <li>
      <Link
        to={childReportPath(childId, item.id)}
        className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white p-6 transition hover:border-ink-sub"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {issued ? (
              <span className="text-app-label text-ink-sub">{issued} 발행</span>
            ) : null}
            {track ? (
              <span className="rounded-full bg-surface-04 px-2 py-0.5 text-app-badge font-semibold text-ink-strong">
                {track}
              </span>
            ) : null}
          </div>
          {item.theme ? (
            <h2 className="mt-1 text-app-card-title font-semibold text-ink-strong">
              {item.theme}
            </h2>
          ) : null}
          {item.plan ? (
            <p className="mt-1 text-app-label text-ink-sub">
              실행계획 {item.plan.done}/{item.plan.total} 진행
            </p>
          ) : null}
        </div>
        <span className="text-app-label text-ink-sub">자세히 보기</span>
      </Link>
    </li>
  );
}
