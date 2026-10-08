// PUT /api/admin/ai-telemetry-pricing { pricing: { [model]: { input_usd_per_1m, output_usd_per_1m, cached_input_usd_per_1m } } }
// Authorization: Bearer <supabase access token>   (관리자)
//
// AI 모델 단가표를 app_settings 에 통째로 교체 저장한다. 검증 규칙은 api/_lib/telemetry/pricing.ts.
//
// 응답 200 { ok, pricing }
// 오류(coded): 400 INVALID_BODY, 401/403 인증, 405 METHOD_NOT_ALLOWED, 500 INTERNAL
//
// 핸들러 본문은 테스트하지 않는다.

import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  AI_MODEL_PRICING_SETTING_KEY,
  validatePricingBody,
} from "../_lib/telemetry/pricing.js";

export default defineHandler({
  methods: ["PUT"],
  auth: "admin",
  errorShape: "coded",
  methodNotAllowedMessage: "PUT만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "AI 모델 단가 저장에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "admin/ai-telemetry-pricing",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const parsed = validatePricingBody(req.body);
    if (!parsed.ok) {
      sendError(res, "coded", 400, parsed.reason, "INVALID_BODY", {
        ok: false,
      });
      return;
    }
    const { error } = await ctx.supabaseAdmin.from("app_settings").upsert(
      {
        key: AI_MODEL_PRICING_SETTING_KEY,
        value: parsed.table,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(`app_settings 저장 실패: ${error.message}`);
    res.status(200).json({ ok: true, pricing: parsed.table });
  },
});

export const config = { runtime: "nodejs" };
