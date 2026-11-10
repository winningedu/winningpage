import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import GoalCard from "@/components/goal/GoalCard";
import DirectionReportBody from "@/components/goal/report/DirectionReportBody";
import { fetchGoalReport } from "@/lib/goalApi";

const VALID_TABS = ["naesin", "jeongsi"] as const;
type DirectionTab = (typeof VALID_TABS)[number];

// DirectionReportBody.tsx의 DirectionReport 타입과 동일한 shape — api/_routes/goal/report.js
// buildDirectionReport()가 만드는 그대로다(GrowthReport.tsx의 동일 패턴 참고).
// activePeriod/periodChips[].value는 이제 회차 옵션 키가 아니라 저장된
// goal_direction_reports 행의 id 문자열이다(QA 행301, 파라미터명도 reportId로 통일).
type DirectionReportData = {
  heading?: string;
  meta?: string;
  periodChips: Array<{ value: string; label: string }>;
  activePeriod?: string;
  scaleMax?: 5 | 9;
  summary: { meta?: string; typeLabel?: string; body?: string };
  subjects: Array<{
    key?: string;
    name: string;
    zoneLabel?: string;
    badge?: string;
    body?: string;
    materials?: string[];
    grade?: number | null;
  }>;
};

type DirectionReportResult =
  | { kind: "success"; report: DirectionReportData }
  | { kind: "awaiting-cuts" }
  | { kind: "not-onboarded" }
  | { kind: "no-session" }
  | { kind: "error" };

// 학습방향 리포트 라우트(#37 내신 탭 / #38 정시 탭) — fetch 훅을 여기서 소유한다
// (DirectionReportBody는 mock을 뗀 순수 프레젠테이션). 쿼리 파라미터 `tab`(내신/정시)과
// `reportId`(저장된 goal_direction_reports 행 id — api/goal/report.js가 돌려주는
// periodChips[].value 중 하나, QA 행301) 둘 다 URL에 유지한다. `reportId`를 생략하면
// 서버가 가장 최근 리포트를 기본값으로 고른다(api/_routes/goal/report.js buildDirectionReport()
// — reports[0], 최신순 정렬).
export default function DirectionReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: DirectionTab = VALID_TABS.includes(tabParam as DirectionTab)
    ? (tabParam as DirectionTab)
    : "naesin";
  const reportIdParam = searchParams.get("reportId") || undefined;

  const [result, setResult] = useState<DirectionReportResult | null>(null);

  useEffect(() => {
    let alive = true;
    setResult(null);
    fetchGoalReport("direction", reportIdParam, tab).then(
      (r: DirectionReportResult) => {
        if (alive) setResult(r);
      },
    );
    return () => {
      alive = false;
    };
  }, [tab, reportIdParam]);

  // 서버가 고른 기본 리포트를 URL에 반영한다 — 새로고침·공유 링크에서도 같은 리포트가 열리도록.
  useEffect(() => {
    if (
      result?.kind === "success" &&
      !reportIdParam &&
      result.report.activePeriod
    ) {
      // 클로저 안에서는 위 if 가드의 narrowing이 유지되지 않아 로컬 변수로 한 번 받아둔다.
      const activeReportId = result.report.activePeriod;
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set("reportId", activeReportId);
          return params;
        },
        { replace: true },
      );
    }
  }, [result, reportIdParam, setSearchParams]);

  function handleTabChange(nextTab: string) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("tab", nextTab);
      params.delete("reportId"); // 탭이 바뀌면 그 탭의 리포트 목록으로 새로 고른다.
      return params;
    });
  }

  function handlePeriodChange(nextReportId: string) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("reportId", nextReportId);
      return params;
    });
  }

  if (result === null || result.kind !== "success") {
    const message =
      result === null
        ? "리포트를 불러오는 중입니다…"
        : result.kind === "awaiting-cuts"
          ? "합격 기준 데이터를 준비 중입니다. 잠시 후 다시 확인해 주세요."
          : "리포트를 불러오지 못했습니다. 새로고침해 주세요.";

    return (
      <div className="max-w-goal-content px-4 pb-24 pt-25 md:px-12">
        <GoalCard tone="neutral" className="px-8 py-7">
          <p className="text-app-body leading-[1.4] text-ink-sub">{message}</p>
        </GoalCard>
      </div>
    );
  }

  return (
    <DirectionReportBody
      tab={tab}
      onTabChange={handleTabChange}
      report={result.report}
      onPeriodChange={handlePeriodChange}
    />
  );
}
