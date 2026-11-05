import { Outlet } from "react-router";
import { site } from "@/config/site";
import B2BFooter from "./b2b/Footer";
import B2BHeader from "./b2b/Header";
import Header from "./Header";
import SiteFooter from "./SiteFooter";

// 헤더/푸터 전역 레이아웃. Header는 position:fixed, SiteFooter는 일반 흐름 배치라
// 개별 페이지에서 렌더하던 것과 시각적으로 동일한 DOM 순서(Header → 페이지 콘텐츠 → Footer)를
// 유지한다. b2bMenu 사이트(스쿨멘토)만 B2B 헤더와 푸터로 바꾼다.
export default function SiteLayout() {
  const b2b = site.features.b2bMenu;

  return (
    <>
      {b2b ? <B2BHeader /> : <Header />}
      <Outlet />
      {b2b ? <B2BFooter /> : <SiteFooter />}
    </>
  );
}
