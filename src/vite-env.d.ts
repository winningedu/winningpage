/// <reference types="vite/client" />

// 사이트 정체성 빌드 env — src/config/site.ts, vite.config.js가 소비한다.
interface ImportMetaEnv {
  readonly VITE_SITE: string;
}
