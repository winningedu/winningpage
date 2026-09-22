import type { RouteObject } from "react-router";
import { Navigate } from "react-router";
import { requireOnlineInquiryAvailableMiddleware } from "@/lib/routeMiddleware";
import CompanyNews from "@/pages/CompanyNews";
import CompanyNewsList from "@/pages/CompanyNewsList";
import ColumnDetail from "@/pages/column/ColumnDetail";
import ColumnHome from "@/pages/column/ColumnHome";
import ColumnList from "@/pages/column/ColumnList";
import Events from "@/pages/Events";
import Faq from "@/pages/Faq";
import OnlineInquiry from "@/pages/OnlineInquiry";

// 공지/뉴스/FAQ/칼럼/온라인문의 — 마케팅 정보성 콘텐츠 그룹.
// ⚠️ 반드시 dynamicPageRoutes(/page/:slug)보다 먼저 조립한다 — 아래로 내려가면
// DynamicPage가 먼저 매칭해 신규 페이지가 뜨지 않는다(applyRoutes.tsx와 동일 이유).
const contentRoutes: RouteObject[] = [
  { path: "/events", Component: Events },
  { path: "/company-news", Component: CompanyNews },
  { path: "/company-news/list", Component: CompanyNewsList },
  { path: "/faq", Component: Faq },
  { path: "/info/column", Component: ColumnHome },
  { path: "/info/column/list", Component: ColumnList },
  { path: "/info/column/:id", Component: ColumnDetail },
  {
    path: "/online-inquiry",
    Component: OnlineInquiry,
    middleware: [requireOnlineInquiryAvailableMiddleware],
  },
  {
    path: "/page/online-inquiry",
    Component: () => <Navigate to="/online-inquiry" replace />,
  },
];

export default contentRoutes;
