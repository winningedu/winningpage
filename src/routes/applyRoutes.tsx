import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import { requirePremiumAvailableMiddleware } from "@/lib/routeMiddleware";
import MentorApply from "@/pages/MentorApply";
import PremiumApply from "@/pages/PremiumApply";

// 이용신청 > 프리미엄 이용 / 멘토신청 + 구 경로 리다이렉트.
// ⚠️ 반드시 dynamicPageRoutes(/page/:slug)보다 먼저 조립한다 — 아래로 내려가면
// DynamicPage가 먼저 매칭해 신규 페이지가 뜨지 않는다.
const applyRoutes: RouteObject[] = [
  // 프리미엄을 숨기는 사이트(스쿨멘토)는 별칭 포함 둘 다 홈으로 되돌린다.
  {
    path: "/premium-apply",
    Component: PremiumApply,
    middleware: [requirePremiumAvailableMiddleware],
  },
  {
    path: "/page/premium-apply",
    Component: () => <Navigate to="/premium-apply" replace />,
    middleware: [requirePremiumAvailableMiddleware],
  },

  { path: "/mentor-apply", Component: MentorApply },
  {
    path: "/page/mentor-apply",
    Component: () => <Navigate to="/mentor-apply" replace />,
  },
];

export default applyRoutes;
