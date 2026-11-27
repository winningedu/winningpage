// /api/admin/ai-telemetry 아래 AI 모델 호출 텔레메트리 조회. 관리자 앱(api/_routes/admin/app.ts)이 .route("/ai-telemetry", aiTelemetry) 로 붙인다.
// 요청 검증과 응답 모양은 shared/ai-telemetry/contract.ts 를 따른다.
// Authorization: Bearer <supabase access token>   (관리자, 메뉴 aiTelemetry view 이상)
//
// 날짜(from, to)는 조회자 시간대(X-Time-Zone 헤더, pricing 제외 필수)의 달력 날짜(YYYY-MM-DD)이고
// to 날짜를 포함한다. 기본 구간은 조회자 시간대의 오늘까지 30일. view 기본값은 summary.
//
// view=summary   쿼리 from, to, service
//   200 { from, to, items[], totals, pricingConfigured }
//   items[]: day, service, calls, okCalls, errorCalls, failureRate, retriedCalls, retryRate,
//            promptTokens, outputTokens, cachedTokens, thoughtsTokens, cachedRatio,
//            p50Ms, p95Ms, costUsd(단가 없는 모델이 섞이면 null), models[]
//            failureRate, retryRate 는 호출이 0건이면 null
// view=calls     쿼리 from, to, service, feature, status(ok|error), retried(1), kind(generate|embed), page, pageSize
//   200 { items[], total, page, pageSize }   items 항목은 ops/calls.ts CallListItem
// view=citations 쿼리 from, to
//   200 { items[] }   인용 적은 순. 항목은 ops/citations.ts CitationItem
// view=pricing
//   200 { pricing, updatedAt }   pricing 은 모델명 별 단가표, 설정 전이면 {} 와 updatedAt null
// 오류(problem): 400 VALIDATION_FAILED/TIME_ZONE_REQUIRED/INVALID_TIME_ZONE, 401/403 인증과 권한, 405, 500
//
// 값 규칙(날짜 구간, 필터 값, 페이지)은 api/_lib/ai/telemetry/ops/query.ts 가 판정하고 어기면 RouteParamError 로 400 이 된다.
// 판단과 변환은 api/_lib/ai/telemetry/ 아래.

import {
  type CallsPage,
  type PricingResponse,
  type SummaryResponse,
  telemetryQuery,
} from "../../../shared/ai-telemetry/contract.js";
import { toCallListItem } from "../../_lib/ai/telemetry/ops/calls.js";
import {
  sortCitations,
  toCitationItem,
} from "../../_lib/ai/telemetry/ops/citations.js";
import {
  parseCallsQuery,
  parseRange,
  parseServiceFilter,
} from "../../_lib/ai/telemetry/ops/query.js";
import {
  aggregateDaily,
  totalsOf,
} from "../../_lib/ai/telemetry/ops/summary.js";
import {
  AI_MODEL_PRICING_SETTING_KEY,
  parsePricingTable,
} from "../../_lib/ai/telemetry/pricing.js";
import { RouteParamError } from "../../_lib/handler.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { TimeZoneRequiredError } from "../../_lib/timeZone.js";

const guard = admin({
  permission: { key: "aiTelemetry" },
  unhandledMessage: "AI 텔레메트리 조회에 실패했습니다.",
  logLabel: "admin/ai-telemetry",
});

/** 시간대가 필요한 view 에서 X-Time-Zone 이 없으면 400 TIME_ZONE_REQUIRED 를 던진다. */
function requireTimeZone(c: { var: { timeZone: string | undefined } }): string {
  if (!c.var.timeZone) throw new TimeZoneRequiredError();
  return c.var.timeZone;
}

function invalid(reason: string): never {
  throw new RouteParamError("query", reason);
}

export const aiTelemetry = adminFactory
  .createApp()
  .get("/", guard, validate("query", telemetryQuery), async (c) => {
    const db = c.var.supabaseAdmin;
    const now = new Date();
    const query = c.req.valid("query");
    const { view } = query;

    const readPricing = async () => {
      const { data, error } = await db
        .from("app_settings")
        .select("value, updated_at")
        .eq("key", AI_MODEL_PRICING_SETTING_KEY)
        .maybeSingle();
      if (error) throw new Error(`app_settings 조회 실패: ${error.message}`);
      return {
        pricing: parsePricingTable(data?.value),
        updatedAt: data?.updated_at ?? null,
      };
    };

    if (view === "pricing") {
      return c.json((await readPricing()) satisfies PricingResponse);
    }

    if (view === "calls") {
      const parsed = parseCallsQuery(query, now, requireTimeZone(c));
      if (!parsed.ok) invalid(parsed.reason);
      const q = parsed.query;
      let rows = db
        .from("ai_model_calls")
        .select("*", { count: "exact" })
        .gte("created_at", q.from.toISOString())
        .lt("created_at", q.to.toISOString());
      if (q.service) rows = rows.eq("service", q.service);
      if (q.feature) rows = rows.eq("feature", q.feature);
      if (q.status) rows = rows.eq("status", q.status);
      if (q.kind) rows = rows.eq("kind", q.kind);
      if (q.retried) rows = rows.gte("attempt", 2);
      const offset = (q.page - 1) * q.pageSize;
      const { data, error, count } = await rows
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + q.pageSize - 1);
      if (error) throw new Error(`ai_model_calls 조회 실패: ${error.message}`);
      return c.json({
        items: (data ?? []).map(toCallListItem),
        total: count ?? 0,
        page: q.page,
        pageSize: q.pageSize,
      } satisfies CallsPage);
    }

    const tz = requireTimeZone(c);
    const range = parseRange(query, now, tz);
    if (!range.ok) invalid(range.reason);

    if (view === "citations") {
      const { data, error } = await db.rpc("fn_ai_telemetry_citations", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      });
      if (error) throw new Error(`citations 조회 실패: ${error.message}`);
      return c.json({
        items: sortCitations((data ?? []).map(toCitationItem), "least_cited"),
      });
    }

    const service = parseServiceFilter(query.service);
    if (!service.ok) invalid(service.reason);
    const [{ data, error }, { pricing, updatedAt }] = await Promise.all([
      db.rpc("fn_ai_telemetry_daily_summary", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
        ...(service.service ? { p_service: service.service } : {}),
        p_tz: tz,
      }),
      readPricing(),
    ]);
    if (error) throw new Error(`일별 요약 조회 실패: ${error.message}`);
    const items = aggregateDaily(data ?? [], pricing);
    return c.json({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      items,
      totals: totalsOf(items),
      pricingConfigured: updatedAt !== null && Object.keys(pricing).length > 0,
    } satisfies SummaryResponse);
  })
  .all("/", methodNotAllowed("GET"));
