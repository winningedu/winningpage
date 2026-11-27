// /api/admin/web-analytics 아래 방문 분석 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/web-analytics", webAnalytics) 로 붙인다.
// 요청 검증과 응답 모양은 shared/web-analytics/contract.ts 를 따른다.
//
// GET /api/admin/web-analytics?from=YYYY-MM-DD&to=YYYY-MM-DD  (X-Time-Zone 필수: from, to 는 보는 사람 시간대의 날짜)
//   -> 200 { range, totals, topPages, events }  (ok 필드 없이 보고서 그대로)
//
// 본사 방문 분석 화면(계획 10번). 이 사이트의 Vercel 프로젝트에서 방문 합계, 많이 본 페이지,
// 이벤트 10개 횟수와 속성별 나눔을 읽는다. 읽기 전용이라 테이블 쓰기가 없다.
// 권한: 메뉴 권한 webAnalytics view(admin() 가드 permission), 거부는 403 FORBIDDEN.
// 오류(problem): 기간 형식이나 순서가 틀리면 400 VALIDATION_FAILED, 시간대 헤더가 없으면 400 TIME_ZONE_REQUIRED,
// env 가 없으면 503 NOT_CONFIGURED, Vercel 이 오류를 내면 502 UPSTREAM_ERROR, GET 이외는 405.

import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import {
  WEB_ANALYTICS_ERROR,
  type WebAnalyticsReport,
  webAnalyticsQuery,
} from "../../../shared/web-analytics/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { TimeZoneRequiredError } from "../../_lib/timeZone.js";
import {
  loadWebAnalyticsReport,
  parseRange,
  readWebAnalyticsConfig,
  WebAnalyticsUpstreamError,
} from "../../_lib/web-analytics/report.js";

const guard = admin({
  permission: { key: "webAnalytics" },
  unhandledMessage: "방문 분석을 불러오지 못했어요.",
  logLabel: "[admin/web-analytics]",
});

export const webAnalytics = adminFactory
  .createApp()
  .get("/", guard, validate("query", webAnalyticsQuery), async (c) => {
    const query = c.req.valid("query");
    const timeZone = c.var.timeZone;
    if (!timeZone) throw new TimeZoneRequiredError();
    const parsed = parseRange(query.from, query.to, timeZone);
    if (!parsed) {
      throw new ProblemError(
        400,
        "조회 기간을 확인해 주세요.",
        PROBLEM_CODE.VALIDATION_FAILED,
      );
    }

    const config = readWebAnalyticsConfig();
    if (!config) {
      throw new ProblemError(
        503,
        "방문 분석 설정이 없어요",
        WEB_ANALYTICS_ERROR.NOT_CONFIGURED,
      );
    }

    try {
      const report = await loadWebAnalyticsReport(config, parsed);
      return c.json(report satisfies WebAnalyticsReport);
    } catch (error) {
      if (!(error instanceof WebAnalyticsUpstreamError)) throw error;
      console.error("[admin/web-analytics] upstream status", error.status);
      throw new ProblemError(
        502,
        "방문 분석을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.",
        WEB_ANALYTICS_ERROR.UPSTREAM_ERROR,
      );
    }
  })
  .all("/", methodNotAllowed("GET"));
