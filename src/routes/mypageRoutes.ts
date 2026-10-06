import type { RouteObject } from "react-router";
import { AuthCheckingFallback } from "@/components/routeGuards/RouteGuardUi";
import { requireAuthMiddleware } from "@/lib/routeMiddleware";
import MyPage from "@/pages/MyPage";
import ChildDiagnosisReport from "@/pages/mypage/ChildDiagnosisReport";
import ChildDiagnosisReports from "@/pages/mypage/ChildDiagnosisReports";
import ChildReport from "@/pages/mypage/ChildReport";

const mypageRoutes: RouteObject[] = [
  // 마이페이지 리뉴얼(Figma 3762:18713 학생/멘토, 3762:20390 학부모) — 공통
  // 헤더/푸터가 있는 시안이라 SiteLayout 안으로 편입(구 /app/goal, /admin과 달리
  // 별도 셸이 없다). 탭 상태는 MyPage.jsx 내부에서 ?tab= 쿼리로 관리한다.
  // /mypage 루트는 여기서 requireAuthMiddleware를 걸지 않는다 — 자체적으로
  // useMyPageProfile이 세션을 조회해 없으면 /login으로 보낸다(비 ?redirect= 방식,
  // 기존 동작 그대로 유지).
  { path: "/mypage", Component: MyPage },

  // 학부모가 자녀의 성장 리포트를 여는 뷰어. 본문(GrowthReportBody)은 학생
  // 뷰와 공유하지만 셸은 다르다 — 목표관리 앱 셸(GoalAppLayout, 사이드바)이
  // 아니라 마이페이지와 같은 SiteLayout 안에 둔다. 학부모는 목표관리 앱의
  // 이용자가 아니라 열람자라서 사이드바 메뉴(타이머·일일기록 등)가 의미가
  // 없기 때문이다. 회원유형/자녀 연결 여부 판정은 ChildReport 안에서
  // fn_parent_children 으로 한다 — 여기 middleware는 "비로그인이면 로그인부터"만
  // 막는다(admissionRoutes.tsx·diagnosisRoutes.tsx와 동일한 requireAuthMiddleware
  // 재사용, ?redirect=로 원래 경로 보존).
  {
    path: "/mypage/children/:studentId/report",
    Component: ChildReport,
    middleware: [requireAuthMiddleware],
    HydrateFallback: AuthCheckingFallback,
  },

  // B5 — 학부모가 자녀의 학습진단 리포트를 여는 뷰어(목록 → 회차 상세).
  // 위 성장 리포트와 같은 셸 원칙(SiteLayout 안, fn_parent_children 게이트)을 쓰지만
  // 별도 라우트 세그먼트(report/diagnosis)로 둔다 — 서비스가 다르면 리포트 도메인도
  // 다르다(diagnosis_reports는 goal report와 무관한 별도 테이블·권한 판정 경로).
  {
    path: "/mypage/children/:studentId/report/diagnosis",
    Component: ChildDiagnosisReports,
    middleware: [requireAuthMiddleware],
    HydrateFallback: AuthCheckingFallback,
  },
  {
    path: "/mypage/children/:studentId/report/diagnosis/:attemptId",
    Component: ChildDiagnosisReport,
    middleware: [requireAuthMiddleware],
    HydrateFallback: AuthCheckingFallback,
  },

  // 학부모가 자녀의 성장설계 리포트를 여는 뷰어(알림톡 "리포트 보기" 진입, 목록에서 회차 상세로).
  // 같은 셸 원칙(SiteLayout 안, fn_parent_children 게이트)이고 서버가 연결 여부를 다시 확인한다.
  // 알림톡으로만 들어오는 화면이라 lazy 로 초기 번들에서 뺀다(청크 대기 중에도 AuthCheckingFallback).
  {
    path: "/mypage/children/:childId/growth",
    lazy: async () => ({
      Component: (await import("@/pages/mypage/ChildGrowthReports")).default,
    }),
    middleware: [requireAuthMiddleware],
    HydrateFallback: AuthCheckingFallback,
  },
  {
    path: "/mypage/children/:childId/growth/:reportId",
    lazy: async () => ({
      Component: (await import("@/pages/mypage/ChildGrowthReport")).default,
    }),
    middleware: [requireAuthMiddleware],
    HydrateFallback: AuthCheckingFallback,
  },
];

export default mypageRoutes;
