import { useOverlayScrollbars } from "overlayscrollbars-react";
import { useEffect } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
  RouterProvider,
  useLocation,
} from "react-router";
import SessionKickGuard from "./components/SessionKickGuard";
import SiteLayout from "./components/SiteLayout";
import { scrollbarsOptions } from "./lib/scrollbarOptions";
import adminRoutes from "./routes/adminRoutes";
import admissionRoutes from "./routes/admissionRoutes";
import alimtalkLinkRoutes from "./routes/alimtalkLinkRoutes";
import applyRoutes from "./routes/applyRoutes";
import authRoutes from "./routes/authRoutes";
import contentRoutes from "./routes/contentRoutes";
import demoRoutes from "./routes/demoRoutes";
import diagnosisRoutes from "./routes/diagnosisRoutes";
import dynamicPageRoutes from "./routes/dynamicPageRoutes";
import goalAppRoutes from "./routes/goalAppRoutes";
import goalOnboardingRoutes from "./routes/goalOnboardingRoutes";
import growthAppRoutes from "./routes/growthAppRoutes";
import inquiryAppRoutes from "./routes/inquiryAppRoutes";
import homeRoutes from "./routes/homeRoutes";
import mypageRoutes from "./routes/mypageRoutes";
import performanceAppRoutes from "./routes/performanceAppRoutes";
import premiumRoutes from "./routes/premiumRoutes";
import selfevalAppRoutes from "./routes/selfevalAppRoutes";
import serviceLandingRoutes from "./routes/serviceLandingRoutes";
import standaloneRoutes from "./routes/standaloneRoutes";
import termsRoutes from "./routes/termsRoutes";

// 라우트 이동 시 페이지 최상단으로 스크롤 (해시 앵커 이동은 예외)
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) pathname은 effect 안에서 읽지 않는 트리거 전용 값 — 라우트가 바뀔 때마다 스크롤을 맨 위로 되돌리기 위한 재실행 신호다.
  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

// 데이터 라우터 루트 — 모든 라우트 그룹에 공통으로 적용되던 ScrollToTop을
// 트리 최상단 레이아웃 라우트로 옮겼다(예전엔 <BrowserRouter> 바로 아래
// <Routes>의 형제였다. 데이터 라우터는 RouterProvider 바깥에 임의 형제를 둘 수
// 없어 라우트 엘리먼트 안으로 편입해야 한다).
// body 오버레이 스크롤바 초기화 — 네이티브 스크롤바가 차지하던 레이아웃 폭을
// 없애 드로어/모달이 열려 배경 스크롤이 잠길 때 생기던 레이아웃 밀림(15px)을
// 없앤다(사용자 결정 C안). index.html의 <body data-overlayscrollbars-initialize>는
// OverlayScrollbars가 준비되기 전까지 네이티브 스크롤바를 CSS로 미리 숨겨(FOUC 방지)
// 두고, 이 훅이 실제 JS 인스턴스를 붙인다. defer: true라 브라우저가 유휴 상태일 때
// (또는 다음 프레임에) 초기화되므로 최초 페인트를 막지 않는다.
//
// base-ui Dialog(드로어/모달)의 스크롤 잠금은 body에 직접 overflow:hidden을
// 걸어 네이티브 스크롤을 막는 방식이라, body가 오버레이 스크롤바로 전환돼도
// 그 잠금 자체와는 충돌하지 않는다 — 잠겼다 풀렸다 하는 동안 body가 다른
// 레이아웃 폭을 차지하지 않으므로 밀림이 사라진다.
function RootLayout() {
  const [initialize] = useOverlayScrollbars({
    defer: true,
    options: { scrollbars: scrollbarsOptions },
  });

  useEffect(() => {
    initialize(document.body);
  }, [initialize]);

  return (
    <>
      <ScrollToTop />
      {/* 어드민 포함 전 계정 대상 킥 감지 — 특정 라우트 그룹이 아니라 모든
          라우트의 공통 조상인 여기 둔다(SessionKickGuard.tsx 헤더 주석 참고). */}
      <SessionKickGuard />
      <Outlet />
    </>
  );
}

const routes: RouteObject[] = [
  {
    Component: RootLayout,
    children: [
      {
        Component: SiteLayout,
        children: [
          ...homeRoutes,
          ...diagnosisRoutes,
          ...goalOnboardingRoutes,
          ...serviceLandingRoutes,
          ...admissionRoutes,
          ...contentRoutes,
          ...applyRoutes,
          ...premiumRoutes,
          ...dynamicPageRoutes,
          ...authRoutes,
          ...termsRoutes,
          ...mypageRoutes,
        ],
      },

      // 목표관리 학생 앱 — 사이드바 셸(GoalAppLayout) 그룹. SiteLayout 밖.
      ...goalAppRoutes,

      // 수행평가 학생 앱 — SessionProvider/RequireEntitlement 셸. SiteLayout 밖.
      ...performanceAppRoutes,

      // 성장설계 학생 앱: SessionProvider/RequireEntitlement 셸. SiteLayout 밖.
      ...growthAppRoutes,
      // 자기평가서 학생 앱: 성장설계와 같은 셸 구조. SiteLayout 밖.
      ...selfevalAppRoutes,
      // 심화탐구 학생 앱: 성장설계와 같은 셸 구조. SiteLayout 밖.
      ...inquiryAppRoutes,

      // 알림톡 승인 링크 → 실제 라우트 리다이렉트. SiteLayout 밖에 둔다 —
      // 헤더·푸터를 그렸다가 곧바로 이동하면 한 프레임 깜빡인다.
      // (경로 랭킹상 /services/goal/reports/* 는 /services/goal 보다,
      //  /mypage/coupons 는 /mypage 보다 구체적이라 순서와 무관하게 먼저 잡힌다.)
      ...alimtalkLinkRoutes,

      ...standaloneRoutes,

      ...adminRoutes,

      ...demoRoutes,

      { path: "*", Component: () => <Navigate to="/" replace /> },
    ],
  },
];

// middleware(가드 3종의 판정 로직, src/lib/routeMiddleware.ts)는 v8부터 기본
// 활성화라 future.v8_middleware 옵션 자체가 사라졌다(react-router 8.3.0, 2026-08-15 범프).
const router = createBrowserRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
