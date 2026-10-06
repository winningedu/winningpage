import { Outlet } from "react-router";
import {
  AppShellSidebarProvider,
  AppShellSidebarTrigger,
} from "@/components/app-shell/AppShellSidebar";
import Header from "@/components/Header";
import RouteLoadingOverlay from "@/components/ui/RouteLoadingOverlay";
import { SidebarInset } from "@/components/ui/sidebar";
import { ToastProvider } from "@/context/ToastContext";
import { deriveInquirySteps } from "./deriveInquirySteps";
import InquiryNotice from "./InquiryNotice";
import { InquiryShellProvider, useInquiryShell } from "./InquiryShellContext";
import InquirySidebar from "./InquirySidebar";

// 심화탐구 학생 앱 셸(/app/inquiry/*). 성장설계 셸(GrowthAppLayout)과 같은 구성이다:
// 공통 헤더, 사이드바, 본문 SidebarInset, 소프트 내비게이션 로딩 표시, ToastProvider.
// 스크롤은 문서(window) 스크롤이고 데스크톱 전용이다.
//
// 세션과 이용권 가드는 여기서 감싸지 않는다. inquiryAppRoutes.tsx 가
//   <SessionProvider serviceKey="inquiry"> -> <RequireEntitlement> -> <InquiryAppLayout>
// 순으로 이미 배선했다. 모든 화면 하단에 고지(InquiryNotice)를 한 번 그린다.
export default function InquiryAppLayout() {
  return (
    <ToastProvider>
      <InquiryShellProvider>
        <InquiryShellContent />
      </InquiryShellProvider>
    </ToastProvider>
  );
}

function InquiryShellContent() {
  const { studentName, gradeLabel, session, currentStep } = useInquiryShell();

  const steps = deriveInquirySteps({
    screenStep: currentStep,
    session: session && {
      status: session.status,
      currentStep: session.currentStep,
      selectedTopicId: session.selectedTopicId,
      designReportId: session.designReportId,
      latestEvaluationId: session.latestEvaluationId,
    },
  });

  return (
    <>
      <Header />
      <AppShellSidebarProvider>
        <div className="flex flex-1">
          <InquirySidebar
            studentName={studentName}
            gradeLabel={gradeLabel}
            steps={steps}
          />
          <SidebarInset className="min-w-0">
            <AppShellSidebarTrigger />
            <RouteLoadingOverlay />
            <Outlet />
            <div className="mt-auto w-full max-w-goal-content px-4 pb-12 pt-10 md:px-12">
              <InquiryNotice />
            </div>
          </SidebarInset>
        </div>
      </AppShellSidebarProvider>
    </>
  );
}
