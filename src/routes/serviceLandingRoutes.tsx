import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import Callmentor from "@/pages/services/Callmentor";
import GoalManagement from "@/pages/services/GoalManagement";
import GrowthDesign from "@/pages/services/GrowthDesign";
import InDepthResearch from "@/pages/services/InDepthResearch";
import PerformanceAssessment from "@/pages/services/PerformanceAssessment";
import SelfAssessment from "@/pages/services/SelfAssessment";

// 서비스 랜딩 4종(Figma 예시 1889:6944/1889:6486/1907:20783/1907:21352) + 구 경로 리다이렉트.
const serviceLandingRoutes: RouteObject[] = [
  { path: "/services/callmentor", Component: Callmentor },
  // 구 경로 — GNB/DB services-content 슬러그가 가리키던 곳. 신규 랜딩으로 리다이렉트
  {
    path: "/page/services-content",
    Component: () => <Navigate to="/services/callmentor" replace />,
  },

  { path: "/services/goal", Component: GoalManagement },
  { path: "/services/performance", Component: PerformanceAssessment },
  { path: "/services/self-assessment", Component: SelfAssessment },
  { path: "/services/research", Component: InDepthResearch },
  { path: "/services/growth", Component: GrowthDesign },

  // 구 경로(DB page_contents 미갱신 시 잔존) → 신규 라우트로 리다이렉트
  {
    path: "/page/services-goal",
    Component: () => <Navigate to="/services/goal" replace />,
  },
  {
    path: "/page/services-ai-performance",
    Component: () => <Navigate to="/services/performance" replace />,
  },
  {
    path: "/page/services-self-assessment",
    Component: () => <Navigate to="/services/self-assessment" replace />,
  },
  {
    path: "/page/services-in-depth-research",
    Component: () => <Navigate to="/services/research" replace />,
  },
  {
    path: "/page/admission-special-highschool-results",
    Component: () => <Navigate to="/admission/special-highschool" replace />,
  },
];

export default serviceLandingRoutes;
