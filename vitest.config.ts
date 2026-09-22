import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// vite.config.js의 resolve.alias("@/") · plugins(react)를 그대로 물려받는다 —
// alias를 두 곳에 따로 유지하면 어긋날 위험이 있어 mergeConfig로 단일 소스를 지킨다.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      // supabase 클라이언트 모듈이 로드 시점에 URL/키를 요구한다. 단위 테스트는
      // 네트워크를 쓰지 않으므로(로컬 스택이 꺼져 있어도 전부 통과) .env.local이
      // 없는 CI에서도 모듈 로드가 죽지 않게 더미를 깔아 준다 — 실값이 있으면 그대로 쓴다.
      env: {
        VITE_SUPABASE_URL:
          process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
        VITE_SUPABASE_ANON_KEY:
          process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_vitest_dummy",
        // src/config/site.ts가 모듈 로드 시점에 이 값을 요구한다(없으면 throw) —
        // Header/SiteFooter 등 대다수 컴포넌트 테스트가 site.ts를 간접 import하므로
        // CI(.env.local 없음)에서도 기본값(winning)을 깔아 둔다. 사이트별 분기를
        // 검증하는 테스트는 vi.stubEnv로 개별 오버라이드한다.
        VITE_SITE: process.env.VITE_SITE ?? "winning",
      },
      // 전역 주입 대신 명시적 import(test/expect/describe from "vitest")를 쓴다 —
      // 이 저장소의 다른 곳들도 암묵적 전역에 의존하지 않는 관례를 따른다.
      globals: false,
      setupFiles: [
        fileURLToPath(new URL("./vitest.setup.ts", import.meta.url)),
      ],
      css: false,
      exclude: [
        "**/node_modules/**",
        // node:test 기반 — 아직 Vitest로 이식되지 않았다(후속 task 10.2 이후 범위).
        // vitest run에 그대로 걸리면 "No test suite found"로 CI가 깨진다.
        "api/_lib/serviceAccess.test.ts",
        // Playwright 러너(e2e/, playwright.config.ts)다 — *.spec.ts 기본 패턴이
        // 겹쳐서 Vitest가 함께 주워가면 "test.describe() 여기서 호출 못 함" 에러로
        // 죽는다(두 러너의 test.describe 구현이 다르다).
        "e2e/**",
      ],
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
      },
    },
  }),
);
