import { type UIEvent, useState } from "react";

// 수행평가 셸 타이틀 접힘 훅 (QA3 행81).
//
// 예전에는 채팅 컨테이너의 넘침 여부(`data-scrollable`)로 접힘을 판정했다. 접히면 컨테이너가
// 커져 넘침이 사라지고, 넘침이 없으면 펼쳐지고, 펼치면 다시 넘쳐 접히는 피드백 루프로
// 화면이 떨렸다. 그래서 넘침 여부가 아니라 스크롤 위치(scrollTop)만 보고, 접힘 임계와
// 펼침 임계를 다르게 둔 히스테리시스로 판정한다. 두 임계 사이에서는 직전 상태를 유지한다.
//
// goal의 `useCondensedOnScroll`은 문서(window) 스크롤 + sticky 헤더 sentinel
// (IntersectionObserver) 전용이라 자체 스크롤 컨테이너인 이 셸에는 맞지 않아 재사용하지
// 않고 같은 히스테리시스 원리만 최소로 둔다.
//
// 접힘 시 타이틀 띠가 줄어드는 높이(약 1.5rem = 24px)보다 두 임계의 간격이 커야, 접힘으로
// 컨테이너가 커져 scrollTop이 되감겨도 펼침 임계 아래로 내려가지 않는다. scrollTop은 JS
// 숫자라 px 단위다.
export const CONDENSE_SCROLL_TOP_PX = 64;
export const EXPAND_SCROLL_TOP_PX = 8;

export function useCondensedByScrollTop() {
  const [isCondensed, setIsCondensed] = useState(false);

  // 스크롤은 버블링하지 않으므로 캡처 단계에서 자식(채팅 뷰포트)의 스크롤을 받는다.
  const onScrollCapture = (event: UIEvent<HTMLElement>) => {
    const { scrollTop } = event.target as HTMLElement;
    if (scrollTop >= CONDENSE_SCROLL_TOP_PX) setIsCondensed(true);
    else if (scrollTop <= EXPAND_SCROLL_TOP_PX) setIsCondensed(false);
  };

  return { isCondensed, onScrollCapture };
}
