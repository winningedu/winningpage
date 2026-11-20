import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import { AdminAccessBoundary } from "@/components/routeGuards/RouteGuardUi";
import { requireAdminMiddleware } from "@/lib/routeMiddleware";
// Admin 섹션 라우트 목록 — CONFIGS(Admin.tsx, 도메인 config 8개 파일 + 폼 컴포넌트를
// 물고 있어 무겁다) 대신 이 파일만 정적으로 import한다. adminSectionKeys.ts 상단
// 주석 참고 — /admin에 들어가지 않는 사용자의 초기 번들에 CONFIGS를 얹지 않기 위함이다.
import {
  ADMIN_DEFAULT_SECTION_KEY,
  ADMIN_SECTION_KEYS,
} from "@/pages/admin/adminSectionKeys";

// 청크(../pages/Admin) 다운로드 대기 중 표시 — route.lazy가 대기하는 동안
// (middleware 판정 + JS 청크 로딩을 함께 블록한다) 정적 최상위 HydrateFallback으로
// 둬야 한다 — lazy() 반환 객체 안에 넣으면 그 자체가 아직 resolve 되기 전이라
// 첫 렌더에 이 라우트가 fallbackIndex 후보에서 빠져 상위(RootLayout, 자체 폴백 없음)
// 까지 올라가 빈 화면이 뜬다.
function AdminChunkLoadingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EF] pt-16 text-[#0D1B2A]">
      <div className="rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-4 text-sm font-extrabold shadow-[0_18px_45px_rgba(13,27,42,0.10)]">
        관리자 페이지 불러오는 중...
      </div>
    </main>
  );
}

// Admin.jsx 전면 route화(§5-1) — 각 CONFIGS 도메인 섹션이 실제 개별 RouteObject다.
// AdminLayout(사이드바/탑바)은 부모 라우트로 한 번만 마운트되어 섹션을
// 옮겨도 유지되고, Outlet 안쪽(AdminSectionRoute)만 섹션별로 갈린다.
// ADMIN_SECTION_KEYS를 순회해 동적 생성하지만, 결과는 CONFIGS 키 46개와
// URL이 1:1로 리터럴 매칭되는 구조다(:section 같은 단일 와일드카드 아님) —
// 새 섹션은 adminSectionKeys.ts와 admin/configs/*에 함께 추가해야 한다.
//
// AdminLayout과 AdminSectionRoute는 같은 모듈(../pages/Admin)의 named export라
// import() specifier가 같으면 번들러가 청크 하나로 묶는다 — 섹션 46개 각각
// 자신의 lazy()에서 다시 import해도 중복 다운로드가 없다(모듈 캐시로 즉시 resolve).
const adminRoutes: RouteObject[] = [
  {
    path: "/admin",
    lazy: async () => {
      const { AdminLayout } = await import("@/pages/Admin");
      return { Component: AdminLayout };
    },
    middleware: [requireAdminMiddleware],
    HydrateFallback: AdminChunkLoadingFallback,
    ErrorBoundary: AdminAccessBoundary,
    children: [
      {
        index: true,
        Component: () => (
          <Navigate to={`/admin/${ADMIN_DEFAULT_SECTION_KEY}`} replace />
        ),
      },
      ...ADMIN_SECTION_KEYS.map((key) => ({
        path: key,
        lazy: async () => {
          const { AdminSectionRoute } = await import("@/pages/Admin");
          // biome-ignore lint/correctness/noComponentHookFactories: 라우트 정의는 모듈 로드 때 한 번만 만들어져 렌더마다 새 컴포넌트가 생기지 않는다
          return { Component: () => <AdminSectionRoute section={key} /> };
        },
      })),
      // 존재하지 않는 섹션 키 — 이전(구 activeKey 기본값)과 동일하게 기본 섹션으로 되돌린다.
      {
        path: "*",
        Component: () => (
          <Navigate to={`/admin/${ADMIN_DEFAULT_SECTION_KEY}`} replace />
        ),
      },
    ],
  },
];

export default adminRoutes;
