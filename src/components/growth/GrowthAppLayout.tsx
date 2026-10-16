import { Outlet } from "react-router";
import {
  AppShellSidebarProvider,
  AppShellSidebarTrigger,
} from "@/components/app-shell/AppShellSidebar";
import Header from "@/components/Header";
import RouteLoadingOverlay from "@/components/ui/RouteLoadingOverlay";
import { SidebarInset } from "@/components/ui/sidebar";
import { ToastProvider } from "@/context/ToastContext";
import GrowthNotice from "@/pages/growth/GrowthNotice";
import { deriveGrowthSteps } from "./deriveGrowthSteps";
import { GrowthShellProvider, useGrowthShell } from "./GrowthShellContext";
import GrowthSidebar from "./GrowthSidebar";

// 성장설계 학생 앱 셸(/app/growth/*). 구성은 수행평가 셸(PerformanceAppLayout)과 같다:
// 공통 헤더, 사이드바, 본문 SidebarInset, 소프트 내비게이션 로딩 표시, ToastProvider.
//
// 스크롤은 문서(window) 스크롤이다. 목표관리 GoalAppLayout 과 같다, 설문처럼 긴 페이지가 많아
// 수행평가 채팅처럼 캔버스 안에서만 스크롤하는 고정 높이 모델은 쓰지 않는다. 그래서 페이지 헤더는
// GoalPageHeader(문서 스크롤용 sticky 접힘)를 쓴다.
//
// 세션과 이용권 가드는 여기서 감싸지 않는다. growthAppRoutes.tsx 가
//   <SessionProvider serviceKey="growth"> -> <RequireEntitlement> -> <GrowthAppLayout>
// 순으로 이미 배선했다(이용권 조회가 2벌이 되면 화면마다 잔여 회차가 갈라진다).
//
// 모든 화면 하단에 고지(GrowthNotice)를 한 번 그린다. 페이지가 따로 그리지 않는다.
export default function GrowthAppLayout() {
  return (
    <ToastProvider>
      <GrowthShellProvider>
        <GrowthShellContent />
      </GrowthShellProvider>
    </ToastProvider>
  );
}

function GrowthShellContent() {
  const {
    studentName,
    gradeLabel,
    openReport,
    latestCompletedReportId,
    currentStep,
  } = useGrowthShell();

  const steps = deriveGrowthSteps({
    screenStep: currentStep,
    openReport: openReport && {
      status: openReport.status,
      currentStep: openReport.currentStep,
      answered: openReport.answered,
      total: openReport.total,
    },
    latestCompletedReportId,
  });

  return (
    <>
      <Header />
      <AppShellSidebarProvider>
        <div className="flex flex-1">
          <GrowthSidebar
            studentName={studentName}
            gradeLabel={gradeLabel}
            steps={steps}
          />

          {/* SidebarInset 자체가 relative flex-1 이라 RouteLoadingOverlay 의 기준 컨테이너가 된다
              (GoalAppLayout 과 같다). */}
          <SidebarInset className="min-w-0">
            <AppShellSidebarTrigger />
            <RouteLoadingOverlay />
            <Outlet />
            <div className="mt-auto w-full max-w-goal-content px-4 pb-12 pt-10 md:px-12">
              <GrowthNotice />
            </div>
          </SidebarInset>
        </div>
      </AppShellSidebarProvider>
    </>
  );
}
