import type { PartialOptions } from "overlayscrollbars";
import { ClickScrollPlugin, OverlayScrollbars } from "overlayscrollbars";

// body 초기화(src/App.tsx RootLayout)와 ScrollArea(src/components/ui/scroll-area.tsx)가
// 공유하는 스크롤바 옵션 단일 정의 — 두 곳에 값을 중복 선언하면 한쪽만 바뀌고 다른 쪽이
// 뒤처지는 드리프트가 생긴다.
//
// clickScroll(트랙을 누르고 있으면 그 방향으로 계속 스크롤)은 기본 번들에 없는
// 별도 플러그인이라, 이 모듈이 로드되는 시점에 한 번 등록해 둔다 — import만 해도
// 부작용(side effect)으로 등록이 끝나므로 호출부는 별도 조치가 필요 없다.
OverlayScrollbars.plugin(ClickScrollPlugin);

const SCROLLBAR_THEME = "os-theme-winning" as const;

// 사용자 확정: "스크롤할 때만 보이게". autoHide: "scroll"은 스크롤이 멈추면
// autoHideDelay(ms) 뒤에 숨긴다. autoHideSuspend: true는 처음 스크롤하기
// 전까지는 계속 보이게 둬(스크롤 가능하다는 사실을 알려주는 최소한의
// 접근성 신호), 사용자가 한 번 스크롤한 뒤부터만 autoHide 정책을 적용한다.
export const scrollbarsOptions: NonNullable<PartialOptions["scrollbars"]> = {
  theme: SCROLLBAR_THEME,
  autoHide: "scroll",
  autoHideDelay: 800,
  autoHideSuspend: true,
  clickScroll: true,
};
