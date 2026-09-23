import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import GoalCard from "@/components/goal/GoalCard";
import GrowthReportBody, {
  type GrowthReport as GrowthReportData,
} from "@/components/goal/report/GrowthReportBody";
import { useAuth } from "@/context/AuthProvider";
import type { FetchGoalStudentResult } from "@/lib/goalApi";
import { fetchGoalReport } from "@/lib/goalApi";
import { goalStudentQueryOptions } from "@/lib/queryClient";

const VALID_PERIODS = ["weekly", "monthly"] as const;
type ReportPeriod = (typeof VALID_PERIODS)[number];

// 표지(QA 2차 시트 행37·51) 학생 이름 — 새 fetch를 추가하지 않고, GoalAppLayout에
// 상주하는 GoalSidebar(GoalSidebarContent.tsx "{profile.name}의 목표관리")가 이미
// 구독하는 캐시(goalStudentQueryOptions, GET /api/goal/student)를 그대로 재구독한다 —
// react-query는 같은 queryKey면 캐시를 공유하므로 이 페이지가 별도로 다시 조회하지
// 않는다(사이드바가 이미 채워 둔 값을 읽는다). GoalSidebar.test.ts의
// deriveDailyRecordDone과 같은 이유로 순수 함수로 분리해 단독 테스트한다 — 이 페이지
// 전체(react-router/react-query/AuthProvider 의존)를 마운트하지 않고도 파생 로직만
// 검증할 수 있다.
export function deriveGrowthReportStudentName(
  goalStudentResult: FetchGoalStudentResult | undefined,
): string | null {
  return goalStudentResult?.kind === "onboarded"
    ? goalStudentResult.student.profile.name
    : null;
}

type GoalReportResult =
  | { kind: "success"; report: GrowthReportData }
  | { kind: "awaiting-cuts" }
  | { kind: "error" };

// 성장 리포트 라우트(#33 주간 / #34 월간) — fetch 훅을 여기서 소유한다(GrowthReportBody는
// 순수 프레젠테이션으로 mock을 뗐다). 쿼리 파라미터 `period`는 이 페이지의 탭 상태(주간/월간)만
// 담는다 — API의 `period`(그 주/달을 특정하는 YMD/YYYY-MM) 인자와는 별개다. 이번 범위엔
// 특정 과거 주·달을 골라 보는 UI가 없어(GoalTabs 2탭뿐) 항상 "이번 주/이번 달"만 조회한다
// (api/goal/report.js가 period 인자 생략 시 오늘 KST 기준으로 기본값을 잡는다).
export default function GrowthReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const periodParam = searchParams.get("period");
  const period: ReportPeriod = VALID_PERIODS.includes(
    periodParam as ReportPeriod,
  )
    ? (periodParam as ReportPeriod)
    : "weekly";

  // `at` — 어느 주/달의 리포트인가. 알림톡 링크가 넘겨주는 값이고
  // (src/routes/alimtalkLinkRoutes.tsx), 형식은 api/goal/report 의 period 인자
  // 그대로다: 주간은 그 주 월요일 YMD('2026-08-17'), 월간은 'YYYY-MM'.
  // 없으면 API 가 오늘(KST) 기준 이번 주/이번 달로 잡는다 — 화면에서 탭만
  // 눌러 들어온 기존 동작이 그대로다.
  //
  // ⚠️ 위 `period` 와 헷갈리지 말 것. period 는 이 페이지의 탭(주간/월간)이고
  //    at 은 "그 탭 안에서 몇 번째 주/달"이다 — 파일 상단 주석이 원래 지적한
  //    바로 그 구분이며, 이제 at 이 후자를 실제로 담는다.
  const at = searchParams.get("at") || undefined;

  const { userId } = useAuth();
  const { data: goalStudentResult } = useQuery(goalStudentQueryOptions(userId));
  const studentName = deriveGrowthReportStudentName(goalStudentResult);

  // fetchGoalReport() 결과를 discriminated union 그대로 보관한다(재가공하지 않는다 —
  // goalApi.js의 kind 계약을 이 컴포넌트가 다시 해석하는 지점을 하나로 좁혀 둔다).
  // null = 아직 응답 도착 전(로딩 중). RequireGoalAccess가 이미 onboarded:true만
  // 통과시키므로 정상 경로에선 kind는 대개 'success'다 — 그 외는 방어적 분기.
  const [result, setResult] = useState<GoalReportResult | null>(null);

  useEffect(() => {
    let alive = true;
    setResult(null);
    fetchGoalReport(period, at).then((r: GoalReportResult) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [period, at]);

  function handlePeriodChange(nextPeriod: ReportPeriod) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("period", nextPeriod);
      // 탭을 바꾸면 at 은 버린다 — 주간 키('2026-08-17')와 월간 키('2026-08')는
      // 형식이 달라서 그대로 들고 넘어가면 반대편 탭에서 해석되지 않는다.
      params.delete("at");
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
      <div className="max-w-goal-content px-4 pb-24 pt-perf-inset md:px-12">
        <GoalCard tone="neutral" className="px-8 py-7">
          <p className="text-app-body leading-[1.4] text-ink-sub">{message}</p>
        </GoalCard>
      </div>
    );
  }

  return (
    <GrowthReportBody
      period={period}
      onPeriodChange={handlePeriodChange}
      report={result.report}
      studentName={studentName}
    />
  );
}
