import type { ComponentType } from "react";
import type { RouteObject } from "react-router";
import RequireEntitlement from "@/components/RequireEntitlement";
import { SELFEVAL_BASE } from "@/components/selfeval/selfevalPaths";
import { SessionProvider } from "@/context/SessionContext";

// 자기평가서 학생 앱. 성장설계(growthAppRoutes)와 같은 규칙으로 SiteLayout 밖에 둔다.
//
// 중첩 순서는 SessionContext.tsx 상단 배선 주석대로 SessionProvider 가 가드보다 바깥이다.
// 가드가 막는 것은 이용권 미보유 하나뿐이다(잔여 회차 0은 차단 사유가 아니다, RequireEntitlement.tsx 주석).
// 이용권 키는 'selfeval'이다.

// 이용권 없는 사용자가 대다수라 셸과 페이지를 초기 번들에서 뺀다. route.lazy 가 대기하는 동안 쓰이는
// 정적 HydrateFallback 이다(growthAppRoutes.tsx 와 같은 패턴).
function SelfevalChunkLoadingFallback() {
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

const selfevalAppRoutes: RouteObject[] = [
  {
    Component: () => <SessionProvider serviceKey="selfeval" />,
    children: [
      {
        Component: () => (
          <RequireEntitlement
            serviceKey="selfeval"
            forbiddenTo={(location) =>
              `/pricing?service=selfeval&redirect=${encodeURIComponent(
                `${location.pathname}${location.search}${location.hash}`,
              )}`
            }
          />
        ),
        children: [
          {
            // 셸 라우트가 /app/selfeval 을 소유하고 자식은 상대 경로다(경로 없는 셸에 index 를 두면
            // 루트("/")에 매칭된다). 세션 화면 경로는 SELFEVAL_PATHS 의 s/:sessionId/* 와 같다.
            path: SELFEVAL_BASE,
            lazy: async () => {
              const { default: SelfevalAppLayout } = await import(
                "@/components/selfeval/SelfevalAppLayout"
              );
              return { Component: SelfevalAppLayout };
            },
            HydrateFallback: SelfevalChunkLoadingFallback,
            children: [
              // 1 시작
              {
                index: true,
                ...page(() => import("@/pages/selfeval/StartPage")),
              },
              // 2 기본 입력
              {
                path: "new",
                ...page(() => import("@/pages/selfeval/NewSessionPage")),
              },
              // 보관함(단계 밖 화면)
              {
                path: "archive",
                ...page(() => import("@/pages/selfeval/ArchivePage")),
              },
              // 3 활동 선택
              {
                path: "s/:sessionId/activities",
                ...page(() => import("@/pages/selfeval/ActivitiesPage")),
              },
              // 4 분석 확인
              {
                path: "s/:sessionId/analysis",
                ...page(() => import("@/pages/selfeval/AnalysisPage")),
              },
              // 5 생성 결과
              {
                path: "s/:sessionId/result",
                ...page(() => import("@/pages/selfeval/ResultPage")),
              },
              // 6 검증
              {
                path: "s/:sessionId/verify",
                ...page(() => import("@/pages/selfeval/VerifyPage")),
              },
              // 6 최종 저장 완료
              {
                path: "s/:sessionId/done",
                ...page(() => import("@/pages/selfeval/DonePage")),
              },
            ],
          },
        ],
      },
    ],
  },
];

export default selfevalAppRoutes;
