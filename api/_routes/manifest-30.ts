import type { RouteLoader } from "./dispatch.js";

// 라우트 키(/api/ 뒤 경로)별 핸들러 지연 로더. 정적 문자열 지정자여야 Vercel 파일 추적기가 따라간다.
// selfeval/reports, selfeval/session 을 Hono(api/app-30.ts)로 옮겨 지금은 비어 있다.
export const routes: Record<string, RouteLoader> = {};
