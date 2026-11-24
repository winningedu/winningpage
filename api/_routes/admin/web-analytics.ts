// GET /api/admin/web-analytics?from=YYYY-MM-DD&to=YYYY-MM-DD  (X-Time-Zone 필수: from, to 는 보는 사람 시간대의 날짜)
//   -> 200 { range, totals, topPages, events }  (ok 필드 없이 보고서 그대로)
//
// 본사 방문 분석 화면(계획 10번). 이 사이트의 Vercel 프로젝트에서 방문 합계, 많이 본 페이지,
// 이벤트 10개 횟수와 속성별 나눔을 읽는다. 읽기 전용이라 테이블 쓰기가 없다.
// 권한: 메뉴 권한 webAnalytics view(defineHandler permission), 거부는 403 FORBIDDEN.
// 오류(problem): 기간 형식이나 순서가 틀리면 400 VALIDATION_FAILED, 시간대 헤더가 없으면 400 TIME_ZONE_REQUIRED,
// env 가 없으면 503 NOT_CONFIGURED, Vercel 이 오류를 내면 502 UPSTREAM_ERROR, GET 이외는 405.

import { z } from "zod";
import { defineHandler, requireTimeZone } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import {
  loadWebAnalyticsReport,
  parseRange,
  readWebAnalyticsConfig,
  WebAnalyticsUpstreamError,
} from "../../_lib/web-analytics/report.js";

export const config = { runtime: "nodejs" };

const querySchema = z.object({ from: z.string(), to: z.string() });

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "webAnalytics" },
  query: querySchema,
  unhandledMessage: "방문 분석을 불러오지 못했어요.",
  logLabel: "[admin/web-analytics]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    const parsed = parseRange(
      ctx.query.from,
      ctx.query.to,
      requireTimeZone(ctx),
    );
    if (!parsed) {
      sendError(
        res,
        "problem",
        400,
        "조회 기간을 확인해 주세요.",
        "VALIDATION_FAILED",
      );
      return;
    }

    const config = readWebAnalyticsConfig();
    if (!config) {
      sendError(
        res,
        "problem",
        503,
        "방문 분석 설정이 없어요",
        "NOT_CONFIGURED",
      );
      return;
    }

    try {
      const report = await loadWebAnalyticsReport(config, parsed);
      res.status(200).json(report);
    } catch (error) {
      if (!(error instanceof WebAnalyticsUpstreamError)) throw error;
      console.error("[admin/web-analytics] upstream status", error.status);
      sendError(
        res,
        "problem",
        502,
        "방문 분석을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
        "UPSTREAM_ERROR",
      );
    }
  },
});
