import type { ComponentType } from "react";
import type { RouteObject } from "react-router";
import { GROWTH_BASE } from "@/components/growth/growthPaths";
import RequireEntitlement from "@/components/RequireEntitlement";
import { SessionProvider } from "@/context/SessionContext";

// 성장설계 학생 앱(growth), 수행평가, 목표관리와 같은 규칙으로 SiteLayout 밖에 둔다.
// `/services/growth`(소개 랜딩)와는 별개 라우트다.
//
// 중첩 순서는 SessionContext.tsx 상단 배선 주석대로 SessionProvider 가 가드보다 바깥이다.
// 가드가 자기 판정을 따로 하지 않고 컨텍스트 값을 읽어야 셸 안쪽 표면이 같은 값을 본다.
// 가드가 막는 것은 이용권 미보유 하나뿐이다(잔여 회차 0은 차단 사유가 아니다, RequireEntitlement.tsx 주석).
// 이용권 키는 'growth'다(programs.program_key, 마이그레이션 growth_program_and_delete).

// 이용권 없는 사용자가 대다수라 셸과 페이지를 초기 번들에서 뺀다. route.lazy 가 대기하는 동안 쓰이는
// 정적 HydrateFallback 이다(performanceAppRoutes.tsx 와 같은 패턴).
function GrowthChunkLoadingFallback() {
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

const growthAppRoutes: RouteObject[] = [
  {
    Component: () => <SessionProvider serviceKey="growth" />,
    children: [
      {
        Component: () => (
          <RequireEntitlement
            serviceKey="growth"
            forbiddenTo={(location) =>
              `/pricing?service=growth&redirect=${encodeURIComponent(
                `${location.pathname}${location.search}${location.hash}`,
              )}`
            }
          />
        ),
        children: [
          {
            // 셸 라우트가 /app/growth 를 소유하고 자식은 상대 경로다. 경로 없는 셸에 index 를 두면
            // 루트("/")에 매칭돼 버리므로(수행평가는 자식에 절대 경로를 써서 피했다) 셸에 경로를 단다.
            path: GROWTH_BASE,
            lazy: async () => {
              const { default: GrowthAppLayout } = await import(
                "@/components/growth/GrowthAppLayout"
              );
              return { Component: GrowthAppLayout };
            },
            HydrateFallback: GrowthChunkLoadingFallback,
            children: [
              // 1 시작
              {
                index: true,
                ...page(() => import("@/pages/growth/StartPage")),
              },
              // 2 학생 조사
              {
                path: "survey",
                ...page(() => import("@/pages/growth/SurveyPage")),
              },
              // 3 활동 선택
              {
                path: "collect",
                ...page(() => import("@/pages/growth/CollectPage")),
              },
              // 4 리포트 생성
              {
                path: "generate",
                ...page(() => import("@/pages/growth/GeneratePage")),
              },
              // 지난 리포트(단계 밖 화면). 정적 세그먼트가 :reportId 보다 먼저 매칭된다.
              {
                path: "reports",
                ...page(() => import("@/pages/growth/ReportsPage")),
              },
              // 5 리포트
              {
                path: "reports/:reportId",
                ...page(() => import("@/pages/growth/ReportPage")),
              },
              // 6 실행계획
              {
                path: "plan",
                ...page(() => import("@/pages/growth/PlanPage")),
              },
            ],
          },
        ],
      },
    ],
  },
];

export default growthAppRoutes;
