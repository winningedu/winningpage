import type { ComponentType } from "react";
import type { RouteObject } from "react-router";
import { INQUIRY_BASE } from "@/components/inquiry/inquiryPaths";
import RequireEntitlement from "@/components/RequireEntitlement";
import { SessionProvider } from "@/context/SessionContext";

// 심화탐구 학생 앱(inquiry). 성장설계 growthAppRoutes.tsx 와 같은 구조로 SiteLayout 밖에 둔다.
// `/services/research`(소개 랜딩)와는 별개 라우트다.
//
// 중첩 순서는 SessionProvider 가 가드보다 바깥이다(SessionContext.tsx 상단 배선 주석).
// 가드가 막는 것은 이용권 미보유 하나뿐이다. 이용권 키는 'inquiry'다(programs.program_key).

// route.lazy 가 대기하는 동안 쓰이는 정적 HydrateFallback 이다(growthAppRoutes.tsx 와 같은 패턴).
function InquiryChunkLoadingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background pt-16 text-ink-strong">
      <div className="rounded-2xl border border-line px-6 py-4 text-app-label font-semibold">
        불러오는 중...
      </div>
    </main>
  );
}

const page = (load: () => Promise<{ default: ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

const inquiryAppRoutes: RouteObject[] = [
  {
    Component: () => <SessionProvider serviceKey="inquiry" />,
    children: [
      {
        Component: () => (
          <RequireEntitlement
            serviceKey="inquiry"
            forbiddenTo={(location) =>
              `/pricing?service=inquiry&redirect=${encodeURIComponent(
                `${location.pathname}${location.search}${location.hash}`,
              )}`
            }
          />
        ),
        children: [
          {
            // 셸 라우트가 /app/inquiry 를 소유하고 자식은 상대 경로다(index 가 루트에 매칭되는 것을 막는다).
            path: INQUIRY_BASE,
            lazy: async () => {
              const { default: InquiryAppLayout } = await import(
                "@/components/inquiry/InquiryAppLayout"
              );
              return { Component: InquiryAppLayout };
            },
            HydrateFallback: InquiryChunkLoadingFallback,
            children: [
              // 1 정보 입력
              {
                index: true,
                ...page(() => import("@/pages/inquiry/InfoPage")),
              },
              // 2 주제 추천
              {
                path: "topics",
                ...page(() => import("@/pages/inquiry/TopicsPage")),
              },
              // 3 설계 리포트
              {
                path: "design",
                ...page(() => import("@/pages/inquiry/DesignPage")),
              },
              // 4 보고서 작성
              {
                path: "write",
                ...page(() => import("@/pages/inquiry/WritePage")),
              },
              // 5 평가 리포트
              {
                path: "evaluate",
                ...page(() => import("@/pages/inquiry/EvaluatePage")),
              },
              // 6 확정과 적립
              {
                path: "finalize",
                ...page(() => import("@/pages/inquiry/FinalizePage")),
              },
              // 보관함(단계 밖 화면). 정적 세그먼트가 :sessionId 보다 먼저 매칭된다.
              {
                path: "reports",
                ...page(() => import("@/pages/inquiry/ReportsPage")),
              },
              {
                path: "reports/:sessionId",
                ...page(() => import("@/pages/inquiry/ReportDetailPage")),
              },
            ],
          },
        ],
      },
    ],
  },
];

export default inquiryAppRoutes;
