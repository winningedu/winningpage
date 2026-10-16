// GET /api/admin/ai-telemetry?view=summary|calls|citations|pricing&from=&to=&service=...
// Authorization: Bearer <supabase access token>   (관리자)
//
// AI 모델 호출 텔레메트리 조회. 날짜(from, to)는 KST 달력 날짜(YYYY-MM-DD)이고 to 날짜를 포함한다.
// 기본 구간은 오늘(KST)까지 30일. view 기본값은 summary.
//
// view=summary   쿼리 from, to, service
//   200 { ok, from, to, items[], totals, pricingConfigured }
//   items[]: day, service, calls, okCalls, errorCalls, failureRate, retriedCalls, retryRate,
//            promptTokens, outputTokens, cachedTokens, thoughtsTokens, cachedRatio,
//            p50Ms, p95Ms, costUsd(단가 없는 모델이 섞이면 null), models[]
// view=calls     쿼리 from, to, service, feature, status(ok|error), retried(1), kind(generate|embed), page, pageSize
//   200 { ok, items[], total, page, pageSize }   items 항목은 ops/calls.ts CallListItem
// view=citations 쿼리 from, to
//   200 { ok, items[] }   인용 적은 순. 항목은 ops/citations.ts CitationItem
// view=pricing
//   200 { ok, pricing, updatedAt }   pricing 은 모델명 별 단가표, 설정 전이면 {} 와 updatedAt null
// 오류(coded): 400 INVALID_QUERY, 401/403 인증, 405 METHOD_NOT_ALLOWED, 500 INTERNAL
//
// 핸들러 본문은 DB 에 묶여 있어 단위 테스트하지 않는다. 판단과 변환은 api/_lib/ai/telemetry/ 아래.

import { toCallListItem } from "../_lib/ai/telemetry/ops/calls.js";
import {
  sortCitations,
  toCitationItem,
} from "../_lib/ai/telemetry/ops/citations.js";
import {
  parseCallsQuery,
  parseRange,
  parseServiceFilter,
  parseView,
} from "../_lib/ai/telemetry/ops/query.js";
import { aggregateDaily, totalsOf } from "../_lib/ai/telemetry/ops/summary.js";
import {
  AI_MODEL_PRICING_SETTING_KEY,
  parsePricingTable,
} from "../_lib/ai/telemetry/pricing.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "AI 텔레메트리 조회에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "admin/ai-telemetry",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const db = ctx.supabaseAdmin;
    const now = new Date();
    const invalid = (reason: string) =>
      sendError(res, "coded", 400, reason, "INVALID_QUERY", { ok: false });

    const view = parseView(req.query.view);
    if (!view) return invalid("view 가 올바르지 않습니다.");

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
      res.status(200).json({ ok: true, ...(await readPricing()) });
      return;
    }

    if (view === "calls") {
      const parsed = parseCallsQuery(req.query, now);
      if (!parsed.ok) return invalid(parsed.reason);
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
        ok: true,
        items: (data ?? []).map(toCallListItem),
        total: count ?? 0,
        page: q.page,
        pageSize: q.pageSize,
      });
      return;
    }

    const range = parseRange(req.query, now);
    if (!range.ok) return invalid(range.reason);

    if (view === "citations") {
      const { data, error } = await db.rpc("fn_ai_telemetry_citations", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      });
      if (error) throw new Error(`citations 조회 실패: ${error.message}`);
      res.status(200).json({
        ok: true,
        items: sortCitations((data ?? []).map(toCitationItem), "least_cited"),
      });
      return;
    }

    const service = parseServiceFilter(req.query.service);
    if (!service.ok) return invalid(service.reason);
    const [{ data, error }, { pricing, updatedAt }] = await Promise.all([
      db.rpc("fn_ai_telemetry_daily_summary", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
        ...(service.service ? { p_service: service.service } : {}),
      }),
      readPricing(),
    ]);
    if (error) throw new Error(`일별 요약 조회 실패: ${error.message}`);
    const items = aggregateDaily(data ?? [], pricing);
    res.status(200).json({
      ok: true,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      items,
      totals: totalsOf(items),
      pricingConfigured: updatedAt !== null && Object.keys(pricing).length > 0,
    });
  },
});

export const config = { runtime: "nodejs" };
