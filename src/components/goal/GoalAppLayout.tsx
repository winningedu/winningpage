import { Outlet } from "react-router";
import {
  AppShellSidebarProvider,
  AppShellSidebarTrigger,
} from "@/components/app-shell/AppShellSidebar";
import SiteHeader from "@/components/SiteHeader";
import RouteLoadingOverlay from "@/components/ui/RouteLoadingOverlay";
import { SidebarInset } from "@/components/ui/sidebar";
import GoalSidebar from "./GoalSidebar";

// 접근 가드(로그인 → 이용권 → 온보딩 완료) 확정(2026-08-10) — App.jsx에서 이 레이아웃의
// 라우트 그룹에 middleware(src/lib/routeMiddleware.ts)를 건다(2026-08-15 컴포넌트 가드 →
// middleware 이관). 이 컴포넌트 자체는 셸(사이드바+본문)만 담당하고 가드 로직은 갖지 않는다.

// 목표관리 앱(로그인 후 서비스) 전용 셸 — docs/figma-goal/00-INDEX.md §5-1.
// 마케팅 사이트 공통 푸터(SiteFooter.jsx)는 여전히 쓰지 않는다(시안 #12~#44 전부 미포함).
// `/mypage`·`/admin`이 SiteLayout 밖에 라우트 그룹으로 배치된 선례를 따라 App.jsx에서 이
// 레이아웃도 SiteLayout 밖에 별도 그룹으로 둔다.
//
// (2026-09-06 개정) 공통 헤더 도입 + shadcn 공식 블록 sidebar-16 구조로 정렬(사용자 결정
// "목표관리/수행평가 다 같은 스타일로") — 마케팅 사이트 공통 헤더(Header.jsx)는 원래
// 이 셸에 없었지만, 수행평가 셸(PerformanceAppLayout.tsx)이 먼저 붙인 시안(Figma
// 3754-3562, QA 행279)이 목표관리에도 그대로 적용되며 이 셸에도 붙는다 — 헤더
// 로고·메뉴가 사이드바의 옛 "메인으로" 링크를 대신한다(goalNavItems.ts 주석 참고).
// 사이드바 고정(스크롤해도 화면에 붙어 있음)·모바일 Sheet 전환·헤더 높이 오프셋은
// AppShellSidebarProvider/GoalSidebar(→ AppShellSidebar)가 수행평가와 공유하는 한
// 곳(app-shell/AppShellSidebar.tsx, sidebar-16 공식 블록 구조)에서 처리한다 — 수동
// `pt-16`/`md:ml-app-sidebar` 재구현 금지, 이 컴포넌트는 그 프로바이더 + `SidebarInset`
// 조립만 한다.
export default function GoalAppLayout() {
  return (
    <>
      <SiteHeader />
      <AppShellSidebarProvider>
        <div className="flex flex-1">
          <GoalSidebar />

          {/* `SidebarInset`(sidebar-16 공식 본문 자리) 자체가 이미 `relative flex-1`이라
              RouteLoadingOverlay(소프트 내비게이션 로딩 표시, goal-mapping.md 행297)의
              기준 컨테이너 겸 사이드바를 가리지 않는 본문 영역이 된다. */}
          <SidebarInset className="min-w-0">
            <AppShellSidebarTrigger />
            <RouteLoadingOverlay />
            <Outlet />
          </SidebarInset>
        </div>
      </AppShellSidebarProvider>
    </>
  );
}
