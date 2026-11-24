// GET /api/admin/ai-telemetry?view=summary|calls|citations|pricing&from=&to=&service=...
// Authorization: Bearer <supabase access token>   (관리자, 메뉴 aiTelemetry view 이상)
//
// AI 모델 호출 텔레메트리 조회. 날짜(from, to)는 조회자 시간대(X-Time-Zone 헤더, pricing 제외 필수)의 달력 날짜(YYYY-MM-DD)이고
// to 날짜를 포함한다. 기본 구간은 조회자 시간대의 오늘까지 30일. view 기본값은 summary.
//
// view=summary   쿼리 from, to, service
//   200 { from, to, items[], totals, pricingConfigured }
//   items[]: day, service, calls, okCalls, errorCalls, failureRate, retriedCalls, retryRate,
//            promptTokens, outputTokens, cachedTokens, thoughtsTokens, cachedRatio,
//            p50Ms, p95Ms, costUsd(단가 없는 모델이 섞이면 null), models[]
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

import { z } from "zod";
import { toCallListItem } from "../../_lib/ai/telemetry/ops/calls.js";
import {
  sortCitations,
  toCitationItem,
} from "../../_lib/ai/telemetry/ops/citations.js";
import {
  AI_VIEWS,
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
import {
  defineHandler,
  RouteParamError,
  requireTimeZone,
} from "../../_lib/handler.js";

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "aiTelemetry" },
  unhandledMessage: "AI 텔레메트리 조회에 실패했습니다.",
  logLabel: "admin/ai-telemetry",
  // 나머지 쿼리 값은 ops/query.ts 가 판정한다. 여기서는 view 만 거른다.
  query: z.looseObject({
    view: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(AI_VIEWS).default("summary"),
    ),
  }),
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    const now = new Date();
    const { view } = ctx.query;
    function invalid(reason: string): never {
      throw new RouteParamError("query", reason);
    }

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
      res.status(200).json(await readPricing());
      return;
    }

    if (view === "calls") {
      const parsed = parseCallsQuery(req.query, now, requireTimeZone(ctx));
      if (!parsed.ok) invalid(parsed.reason);
      const q = parsed.query;
      let query = db
        .from("ai_model_calls")
        .select("*", { count: "exact" })
        .gte("created_at", q.from.toISOString())
        .lt("created_at", q.to.toISOString());
      if (q.service) query = query.eq("service", q.service);
      if (q.feature) query = query.eq("feature", q.feature);
      if (q.status) query = query.eq("status", q.status);
      if (q.kind) query = query.eq("kind", q.kind);
      if (q.retried) query = query.gte("attempt", 2);
      const offset = (q.page - 1) * q.pageSize;
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + q.pageSize - 1);
      if (error) throw new Error(`ai_model_calls 조회 실패: ${error.message}`);
      res.status(200).json({
        items: (data ?? []).map(toCallListItem),
        total: count ?? 0,
        page: q.page,
        pageSize: q.pageSize,
      });
      return;
    }

    const tz = requireTimeZone(ctx);
    const range = parseRange(req.query, now, tz);
    if (!range.ok) invalid(range.reason);

    if (view === "citations") {
      const { data, error } = await db.rpc("fn_ai_telemetry_citations", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      });
      if (error) throw new Error(`citations 조회 실패: ${error.message}`);
      res.status(200).json({
        items: sortCitations((data ?? []).map(toCitationItem), "least_cited"),
      });
      return;
    }

    const service = parseServiceFilter(req.query.service);
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
    res.status(200).json({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      items,
      totals: totalsOf(items),
      pricingConfigured: updatedAt !== null && Object.keys(pricing).length > 0,
    });
  },
});

export const config = { runtime: "nodejs" };
