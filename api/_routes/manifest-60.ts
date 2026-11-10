import type { RouteLoader } from "./dispatch.js";

// 라우트 키(/api/ 뒤 경로)별 핸들러 지연 로더. 정적 문자열 지정자여야 Vercel 파일 추적기가 따라간다.
export const routes: Record<string, RouteLoader> = {
  "admin/knowledge-dedupe": () => import("./admin/knowledge-dedupe.js"),
  "admin/knowledge-eval": () => import("./admin/knowledge-eval.js"),
  "growth/collect": () => import("./growth/collect.js"),
  "growth/report": () => import("./growth/report.js"),
  "inquiry/evaluate-report": () => import("./inquiry/evaluate-report.js"),
  "inquiry/plan-report": () => import("./inquiry/plan-report.js"),
  "inquiry/recommend-topics": () => import("./inquiry/recommend-topics.js"),
  "performance/admin-embed": () => import("./performance/admin-embed.js"),
  "performance/analyze-guide": () => import("./performance/analyze-guide.js"),
  "performance/design-report": () => import("./performance/design-report.js"),
  "performance/evaluate": () => import("./performance/evaluate.js"),
  "performance/recommend-topics": () =>
    import("./performance/recommend-topics.js"),
  "selfeval/analyze": () => import("./selfeval/analyze.js"),
  "selfeval/finalize": () => import("./selfeval/finalize.js"),
  "selfeval/verify": () => import("./selfeval/verify.js"),
  "selfeval/write": () => import("./selfeval/write.js"),
};
