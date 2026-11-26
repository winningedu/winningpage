import { Outlet } from "react-router";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

// 헤더/푸터 전역 레이아웃. Header는 position:fixed, SiteFooter는 일반 흐름 배치라
// 개별 페이지에서 렌더하던 것과 시각적으로 동일한 DOM 순서(Header → 페이지 콘텐츠 → Footer)를
// 유지한다. 푸터는 두 사이트가 같은 컴포넌트를 쓴다(사이트 차이는 SiteConfig).
export default function SiteLayout() {
  return (
    <>
      <SiteHeader />
      <Outlet />
      <SiteFooter />
    </>
  );
}
