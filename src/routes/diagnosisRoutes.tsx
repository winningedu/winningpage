import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import { AuthCheckingFallback } from "@/components/routeGuards/RouteGuardUi";
import { requireAuthMiddleware } from "@/lib/routeMiddleware";
import LearningDiagnosisLanding from "@/pages/renewal/LearningDiagnosisLanding";
import SurveyStepPage from "@/pages/renewal/SurveyStepPage";
import SurveyStepShell from "@/pages/renewal/SurveyStepShell";

// 학습진단 6종 URL 통일 규칙 정본(2026-08-10) — 소개(마케팅) 페이지는
// /services/{slug}(자식 = /services 목록 페이지), 앱(이용 화면)은 /app/{slug}/...
// 목표관리(/app/goal/*)에 이어 학습진단도 이 규칙으로 이관했다.
const diagnosisRoutes: RouteObject[] = [
  {
    path: "/services/learning-diagnosis",
    Component: LearningDiagnosisLanding,
  },
  // 비회원 진입 차단(QA 행 27·101) — /checkout(homeRoutes.tsx)과 동일하게
  // requireAuthMiddleware만 건다. 이용권 판정은 하지 않는다(무료·체험 성격 유지) —
  // 로그인 여부만 확인해 비회원을 /login?redirect=...로 보내고, 회원가입 링크는
  // 로그인 화면이 이미 제공한다.
  {
    path: "/app/learning-diagnosis/survey",
    Component: SurveyStepShell,
    middleware: [requireAuthMiddleware],
    HydrateFallback: AuthCheckingFallback,
    children: [
      // /survey 진입은 스텝1로 명시 리다이렉트. 없으면 최하단 catch-all 이 홈으로 삼킨다.
      {
        index: true,
        Component: () => (
          <Navigate to="/app/learning-diagnosis/survey/1" replace />
        ),
      },
      { path: ":step", Component: SurveyStepPage },
      // /survey/1/2 같은 초과 세그먼트 방어. 반드시 마지막.
      {
        path: "*",
        Component: () => (
          <Navigate to="/app/learning-diagnosis/survey/1" replace />
        ),
      },
    ],
  },

  // 구 경로 4종 호환. 외부 링크·북마크 보호용이라 영구 유지한다.
  // /free-diagnosis 계열은 원래 /learning-diagnosis로 2홉 리다이렉트였으나, 목적지가
  // 신 경로로 바뀌면서 함께 갱신 — 항상 신 경로로 1홉만 거치도록 유지한다.
  {
    path: "/learning-diagnosis",
    Component: () => <Navigate to="/services/learning-diagnosis" replace />,
  },
  {
    path: "/learning-diagnosis/survey",
    Component: () => <Navigate to="/app/learning-diagnosis/survey" replace />,
  },
  {
    path: "/free-diagnosis",
    Component: () => <Navigate to="/services/learning-diagnosis" replace />,
  },
  {
    path: "/free-diagnosis/survey",
    Component: () => <Navigate to="/app/learning-diagnosis/survey" replace />,
  },
  {
    path: "/free-diagnosis/report",
    Component: () => <Navigate to="/learning-diagnosis/report" replace />,
  },
];

export default diagnosisRoutes;
