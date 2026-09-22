import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { transformSiteHtml } from "./vite.siteHtml.mjs";

// VITE_SITE(winning|schoolmentor) 빌드 검증 — src/config/site.ts가 런타임에 같은
// 값을 다시 확인하지만, 여기서 먼저 막아야 값이 빠진 빌드가 배포까지 가지 않는다.
//
// defineConfig를 함수 형태(mode 콜백)로 바꾸지 않고 플러그인 훅으로 구현한다 —
// vitest.config.ts가 mergeConfig(viteConfig, ...)로 이 파일을 그대로 물려받는데,
// mergeConfig는 콜백 형태 config를 병합하지 못한다("Cannot merge config in form
// of callback"). 플러그인의 config 훅은 정적 객체 export를 유지한 채로 mode를
// 받을 수 있어 이 제약을 피한다.
//
// vitest도 이 config를 로드하는데(CI typecheck job) CI엔 .env.local이 없어
// VITE_SITE가 정의돼 있지 않다 — test 모드는 검증을 건너뛴다(로컬 .env.local엔
// 이미 VITE_SITE=winning이 있어 dev/build는 그대로 걸린다).
function validateSiteEnv() {
  return {
    name: "validate-site-env",
    config(_config, { mode }) {
      if (mode === "test") return;
      const env = loadEnv(mode, process.cwd(), "");
      if (env.VITE_SITE !== "winning" && env.VITE_SITE !== "schoolmentor") {
        throw new Error("VITE_SITE 누락/오류 — winning 또는 schoolmentor");
      }
    },
  };
}

// index.html의 <title>·favicon을 사이트별로 치환한다. 실제 치환 로직은
// vite.siteHtml.mjs(순수 함수, vitest로 검증)에 있다 — 이 플러그인은 그 함수에
// mode의 VITE_SITE를 넘기는 얇은 어댑터다. validateSiteEnv와 같은 이유(mode는
// config 훅에서만 받고, transformIndexHtml 훅 인자에는 없다)로 mode를 클로저에
// 담아 재사용한다. test 모드는 건너뛴다(CI엔 .env.local이 없다 — VITE_SITE 부재).
function siteHtml() {
  let mode = "production";
  return {
    name: "site-html",
    config(_config, env) {
      mode = env.mode;
    },
    transformIndexHtml(html) {
      if (mode === "test") return html;
      const env = loadEnv(mode, process.cwd(), "");
      if (env.VITE_SITE !== "winning" && env.VITE_SITE !== "schoolmentor") {
        return html;
      }
      return transformSiteHtml(html, env.VITE_SITE);
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
  // /api/* 만 vercel dev(3000)로 넘긴다.
  //
  // 왜: `vercel dev` 를 그대로 쓰면 **모든 요청**이 vercel 의 HTTP 레이어를 거쳐
  // 내부 vite 로 다시 넘어간다. 모듈·HMR 요청 하나하나가 한 홉씩 더 타서 화면이
  // 뜨는 데만 몇 십 초가 걸리고, 버튼 한 번 누를 때마다 느껴진다. 게다가 /api 는
  // 호출할 때마다 함수를 새로 번들링(esbuild)하고 Node 프로세스를 새로 띄운다
  // (로컬에는 웜 재사용이 없다) — @supabase/supabase-js·undici 가 그래프에 있어
  // 호출당 수 초다. 윈도우는 프로세스 생성 비용이 더 커서 체감이 배가된다.
  //
  // 그래서 앞뒤를 뒤집는다: 브라우저는 vite(5173)에 직접 붙어 HMR 속도를 그대로
  // 쓰고, /api/* 만 vercel 로 넘긴다. 그 비용은 실제로 API 를 부를 때만 낸다.
  //
  //   터미널 1) npm run dev:api    (vercel dev — /api 담당, 3000)
  //   터미널 2) npm run dev        (vite — 브라우저는 여기, 5173)
  //
  // API 를 안 건드리는 작업(어드민 화면 대부분은 supabase-js 로 브라우저에서
  // 직접 조회한다)이라면 터미널 1 은 아예 안 띄워도 된다. 그때 /api 요청은
  // ECONNREFUSED 로 즉시 실패한다 — SPA HTML 이 돌아와 response.json() 에서
  // 터지던 기존 증상보다 원인이 분명하다.
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
        // api/_lib 는 서버 함수와 프론트가 계산식을 공유하는 소스 모듈이다
        // (예: SubmissionForm → submission-chars). 브라우저가 vite 모듈 URL
        // "/api/_lib/…"로 요청하는데 이걸 프록시로 넘기면 함수 라우트가 아니라
        // 404가 나고, 수행평가 화면 전체가 동적 import 실패로 죽는다.
        // bypass가 문자열(원래 URL)을 돌려주면 프록시를 타지 않고 vite가
        // 소스 파일로 직접 서빙한다.
        bypass(req) {
          if (req.url?.startsWith("/api/_lib/")) return req.url;
          return undefined;
        },
      },
    },
  },
  plugins: [
    validateSiteEnv(),
    siteHtml(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // BlockNote 계열을 이름 있는 단일 청크로 고정한다 — 빌드 출력에서 청크 크기를 바로 읽기 위함.
        // 두 importer(Admin의 에디터, ColumnBodyBlockNote)가 모두 lazy라 청크도 async로 남는다.
        // src/ 어디서도 이 패키지들을 정적으로 import하지 않는다(정적 승격 위험 없음).
        // emoji-mart / @emoji-mart/data 는 core가 동적 import하므로 목록에 없다 — 별도 청크로 빠지고
        // 리더 경로에 들어오지 않는다(emojiPicker={false}로 컨트롤러도 껐다).
        manualChunks(id) {
          if (
            id.includes("node_modules/@blocknote/") ||
            id.includes("node_modules/prosemirror-") ||
            id.includes("node_modules/@tiptap/") ||
            id.includes("node_modules/@ariakit/") ||
            id.includes("node_modules/@floating-ui/")
          ) {
            return "blocknote";
          }
        },
      },
    },
  },
});
