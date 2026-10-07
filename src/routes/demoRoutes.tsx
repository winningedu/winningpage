import type { RouteObject } from "react-router";
import { AdminAccessBoundary } from "@/components/routeGuards/RouteGuardUi";
import { requireAdminMiddleware } from "@/lib/routeMiddleware";

// 데모 라우트 공용 청크 로딩 폴백 — /admin 것과 같은 스타일로 맞춘다. route.lazy가
// 대기하는 동안(middleware 판정 + 청크 로딩을 함께 블록) 쓰이므로 정적 최상위
// HydrateFallback으로 둔다(adminRoutes.tsx AdminChunkLoadingFallback 주석 참고).
function DemoChunkLoadingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
        데모 페이지 불러오는 중...
      </div>
    </main>
  );
}

// /demo, /demo/:demoKey — 고객사 목업 데모 원문(어드민 전용). SiteLayout 밖(/admin과
// 같은 층위)에 둔다. 자체 크롬(헤더/푸터 또는 전체화면 앱 UI)을 갖고 있어 사이트
// 헤더/푸터와 겹치면 크롬이 이중화된다. lazy가 핵심이다 — 가드(requireAdminMiddleware)를
// 통과하기 전엔 HTML 문자열이 든 청크를 네트워크에서 받지도 않는다.
const demoRoutes: RouteObject[] = [
  {
    path: "/demo",
    lazy: async () => {
      const { default: DemoIndex } = await import("@/pages/demo/DemoIndex");
      return { Component: DemoIndex };
    },
    middleware: [requireAdminMiddleware],
    HydrateFallback: DemoChunkLoadingFallback,
    ErrorBoundary: AdminAccessBoundary,
  },
  {
    path: "/demo/:demoKey",
    lazy: async () => {
      const { default: DemoFrame } = await import("@/pages/demo/DemoFrame");
      return { Component: DemoFrame };
    },
    middleware: [requireAdminMiddleware],
    HydrateFallback: DemoChunkLoadingFallback,
    ErrorBoundary: AdminAccessBoundary,
  },
];

export default demoRoutes;
