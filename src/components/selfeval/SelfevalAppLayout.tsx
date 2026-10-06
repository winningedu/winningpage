import { Outlet } from "react-router";
import {
  AppShellSidebarProvider,
  AppShellSidebarTrigger,
} from "@/components/app-shell/AppShellSidebar";
import Header from "@/components/Header";
import RouteLoadingOverlay from "@/components/ui/RouteLoadingOverlay";
import { SidebarInset } from "@/components/ui/sidebar";
import { ToastProvider } from "@/context/ToastContext";
import { deriveSelfevalSteps } from "./deriveSelfevalSteps";
import SelfevalNotice from "./SelfevalNotice";
import {
  SelfevalShellProvider,
  useSelfevalShell,
} from "./SelfevalShellContext";
import SelfevalSidebar from "./SelfevalSidebar";

// 자기평가서 학생 앱 셸(/app/selfeval/*). 구성은 성장설계 셸(GrowthAppLayout)과 같다:
// 공통 헤더, 사이드바, 본문 SidebarInset, 소프트 내비게이션 로딩 표시, ToastProvider.
// 스크롤은 문서(window) 스크롤이라 페이지 헤더는 GoalPageHeader 를 쓴다.
//
// 세션과 이용권 가드는 여기서 감싸지 않는다. selfevalAppRoutes.tsx 가
//   <SessionProvider serviceKey="selfeval"> -> <RequireEntitlement> -> <SelfevalAppLayout>
// 순으로 이미 배선했다(이용권 조회가 2벌이 되면 화면마다 잔여 회차가 갈라진다).
//
// 모든 화면 하단에 고지(SelfevalNotice)를 한 번 그린다. 페이지가 따로 그리지 않는다.
export default function SelfevalAppLayout() {
  return (
    <ToastProvider>
      <SelfevalShellProvider>
        <SelfevalShellContent />
      </SelfevalShellProvider>
    </ToastProvider>
  );
}

function SelfevalShellContent() {
  const { studentName, gradeLabel, openSession, currentStep } =
    useSelfevalShell();

  const steps = deriveSelfevalSteps({
    screenStep: currentStep,
    openSession: openSession && {
      id: openSession.id,
      currentStep: openSession.currentStep,
    },
  });

  return (
    <>
      <Header />
      <AppShellSidebarProvider>
        <div className="flex flex-1">
          <SelfevalSidebar
            studentName={studentName}
            gradeLabel={gradeLabel}
            steps={steps}
          />

          {/* SidebarInset 자체가 relative flex-1 이라 RouteLoadingOverlay 의 기준 컨테이너가 된다. */}
          <SidebarInset className="min-w-0">
            <AppShellSidebarTrigger />
            <RouteLoadingOverlay />
            <Outlet />
            <div className="mt-auto w-full max-w-goal-content px-4 pb-12 pt-10 md:px-12">
              <SelfevalNotice />
            </div>
          </SidebarInset>
        </div>
      </AppShellSidebarProvider>
    </>
  );
}
