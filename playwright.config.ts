import { defineConfig } from "@playwright/test";

// 로컬 dev 서버(5303)는 이 config가 직접 띄우지 않는다 — 검증 세션이 이미
// qa5 워크트리를 대상으로 5303을 점유하고 있어([[verification-single-port-5303]]),
// 여기서 `webServer`로 새 서버를 띄우면 그 프로세스와 충돌한다. 서버는 항상
// 수동으로 기동한 뒤 `E2E_BASE_URL`(또는 기본값 5303)로 접속한다.
export default defineConfig({
  testDir: "e2e",
  // fixtures 아래 *.test.ts 는 Vitest 단위 테스트라 Playwright 가 줍지 않게 한다.
  testIgnore: "**/fixtures/**",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5303",
    viewport: { width: 1440, height: 900 },
  },
});
