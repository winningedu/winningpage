import type { RouteLoader } from "./dispatch.js";

// 라우트 키(/api/ 뒤 경로)별 핸들러 지연 로더. 정적 문자열 지정자여야 Vercel 파일 추적기가 따라간다.
export const routes: Record<string, RouteLoader> = {
  "admin/knowledge-search": () => import("./admin/knowledge-search.js"),
  "selfeval/pick-records": () => import("./selfeval/pick-records.js"),
  "selfeval/reports": () => import("./selfeval/reports.js"),
  "selfeval/session": () => import("./selfeval/session.js"),
};
