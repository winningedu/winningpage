// GET /api/admin/web-analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// 본사 방문 분석 화면(계획 10번). 이 사이트의 Vercel 프로젝트에서 방문 합계, 많이 본 페이지,
// 이벤트 10개 횟수와 속성별 나눔을 읽는다. 권한: 로그인 + webAnalytics 보기 권한.
// env 가 없으면 503, Vercel 이 오류를 내면 502.

import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { hasWebAnalyticsViewPermission } from "../../_lib/web-analytics/permission.js";
import {
  loadWebAnalyticsReport,
  parseRange,
  readWebAnalyticsConfig,
  WebAnalyticsUpstreamError,
} from "../../_lib/web-analytics/report.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "방문 분석을 불러오지 못했어요.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/web-analytics]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const allowed = await hasWebAnalyticsViewPermission(
      ctx.supabaseAdmin,
      requireUserId(ctx),
    );
    if (!allowed) {
      sendError(res, "coded", 403, "방문 분석 권한이 없어요.", "FORBIDDEN");
      return;
    }

    const parsed = parseRange(req.query.from, req.query.to);
    if (!parsed) {
      sendError(res, "coded", 400, "조회 기간을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const config = readWebAnalyticsConfig();
    if (!config) {
      sendError(res, "coded", 503, "방문 분석 설정이 없어요", "NOT_CONFIGURED");
      return;
    }

    try {
      const report = await loadWebAnalyticsReport(config, parsed);
      res.status(200).json({ ok: true, ...report });
    } catch (error) {
      if (!(error instanceof WebAnalyticsUpstreamError)) throw error;
      console.error("[admin/web-analytics] upstream status", error.status);
      sendError(
        res,
        "coded",
        502,
        "방문 분석을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
        "UPSTREAM_ERROR",
      );
    }
  },
});
