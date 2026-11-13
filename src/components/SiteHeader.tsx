import { site } from "@/config/site";
import B2BHeader from "./b2b/Header";
import Header from "./Header";

// 사이트별 헤더 선택 규칙의 단일 지점. b2bMenu 사이트(스쿨멘토)만 B2B 헤더를 쓴다.
// 두 헤더 모두 position:fixed h-16이라 레이아웃 오프셋은 사이트와 무관하게 같다.
// showHome: 서비스 화면 셸이 켠다. 스쿨멘토 헤더에만 메인으로 버튼이 생기고 위닝 헤더는 그대로다.
export default function SiteHeader({
  showHome = false,
}: {
  showHome?: boolean;
}) {
  return site.features.b2bMenu ? <B2BHeader showHome={showHome} /> : <Header />;
}
