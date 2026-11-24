import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// 관리자 감사 행(쓰기와 조회, defineHandler 가 응답 뒤에 적재)은 라우트 테스트의 insert 단언에 섞이지 않게 기본으로 끈다.
// 감사 동작은 api/_lib/handler.audit.test.ts 가 vi.unmock 으로 실제 모듈을 써서 검증한다.
vi.mock("./api/_lib/accessLog/adminWrite.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("./api/_lib/accessLog/adminWrite.js")
  >()),
  scheduleAdminAudit: () => {},
}));

afterEach(() => {
  cleanup();
});

// jsdom은 `window.matchMedia`를 구현하지 않는다 — shadcn `useIsMobile`
// (src/hooks/use-mobile.ts, AppShellSidebar.tsx가 쓰는 `SidebarProvider`의
// 내부 의존성)가 마운트 시 `window.matchMedia(...)`를 호출하므로, 실제 DOM에
// 마운트하는 테스트(@testing-library/react `render`)에서 전부 깨진다.
// `renderToStaticMarkup`(SSR, effect 미실행)만 쓰는 테스트는 이 폴리필이
// 없어도 통과하지만, 다른 테스트가 이미 같은 함정을 밟을 수 있어 여기 전역으로
// 둔다. matches는 항상 false(데스크톱 취급) — 모바일 분기를 검증하려는 테스트가
// 생기면 그때 개별적으로 `window.matchMedia`를 재정의한다.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
