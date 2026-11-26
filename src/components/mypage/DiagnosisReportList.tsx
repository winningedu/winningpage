import { Link } from "react-router";
import GoalCard from "@/components/goal/GoalCard";
import type { DiagnosisReportListItem } from "@/lib/diagnosisReportQueries";
import { formatDate } from "@/lib/time/format";

// 학습진단 리포트 회차 목록. 학부모(ChildDiagnosisReports)와 학생 본인(MyDiagnosisReports)이
// 같은 목록을 쓰고, 행이 여는 리포트 경로만 다르다(reportHref).

// "YYYY. MM. DD" 를 보는 사람의 브라우저 시간대로 표기한다(MyServicesTab.formatDateSpaced와 같은 표기).
function formatDiagnosedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDate(date).replaceAll("-", ". ");
}

// 신규 카피, 승인 대기(0건 빈 상태, QA 시트 행 210).
const EMPTY_STATE_NOTICE = "아직 완료된 학습진단이 없어요.";

// 이미 배포된 목록 표기(회차와 날짜 사이 가운뎃점, 링크 끝 화살표)를 그대로 유지한다.
const ROW_SEPARATOR = " \u00b7 ";
const OPEN_LABEL = "리포트 보기 \u2192";

export default function DiagnosisReportList({
  reports,
  reportHref,
}: {
  /** null 은 조회 중. */
  reports: DiagnosisReportListItem[] | null;
  reportHref: (attemptId: string) => string;
}) {
  if (reports === null) {
    return (
      <GoalCard tone="neutral" className="mt-6 px-8 py-7">
        <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">
          목록을 불러오는 중입니다…
        </p>
      </GoalCard>
    );
  }

  if (reports.length === 0) {
    return (
      <GoalCard tone="neutral" className="mt-6 px-8 py-7">
        <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">
          {EMPTY_STATE_NOTICE}
        </p>
      </GoalCard>
    );
  }

  return (
    <ul className="mt-6 flex flex-col gap-3">
      {reports.map((report, index) => (
        <li key={report.attempt_id}>
          <Link
            to={reportHref(report.attempt_id)}
            className="flex items-center justify-between gap-4 rounded-xl border border-[#e5e5e5] px-6 py-5 transition hover:bg-surface-04"
          >
            <span className="text-[0.9375rem] font-medium text-ink">
              {/* 최신순 목록이라 마지막(가장 오래된) 행이 1회차다. */}
              {reports.length - index}회차 학습진단
              {ROW_SEPARATOR}
              {formatDiagnosedAt(report.diagnosed_at)}
            </span>
            <span className="text-[0.875rem] font-medium text-accent">
              {OPEN_LABEL}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
