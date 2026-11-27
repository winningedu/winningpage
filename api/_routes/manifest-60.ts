import type { RouteLoader } from "./dispatch.js";

// 라우트 키(/api/ 뒤 경로)별 핸들러 지연 로더. 정적 문자열 지정자여야 Vercel 파일 추적기가 따라간다.
export const routes: Record<string, RouteLoader> = {
  "growth/collect": () => import("./growth/collect.js"),
  "growth/report": () => import("./growth/report.js"),
  "inquiry/evaluate-report": () => import("./inquiry/evaluate-report.js"),
  "inquiry/plan-report": () => import("./inquiry/plan-report.js"),
  "inquiry/recommend-topics": () => import("./inquiry/recommend-topics.js"),
};
