// PUT /api/admin/ai-telemetry-pricing { pricing: { [model]: { input_usd_per_1m, output_usd_per_1m, cached_input_usd_per_1m } } }
// Authorization: Bearer <supabase access token>   (관리자, 메뉴 aiTelemetry edit)
//
// AI 모델 단가표를 app_settings 에 통째로 교체 저장한다. 검증 규칙은 api/_lib/ai/telemetry/pricing.ts.
// 쓰는 곳은 app_settings 의 단가 키 한 행(value, updated_at)뿐이다.
//
// 응답 200 { pricing }
// 오류(problem): 400 VALIDATION_FAILED, 401/403 인증과 권한, 405, 500

import { z } from "zod";
import {
  AI_MODEL_PRICING_SETTING_KEY,
  validatePricingBody,
} from "../../_lib/ai/telemetry/pricing.js";
import { defineHandler } from "../../_lib/handler.js";

// 값 규칙은 pricing.ts 한 곳에서 판정하고 어기면 pricing 경로의 검증 오류로 바꾼다.
const bodySchema = z
  .object({ pricing: z.record(z.string(), z.unknown()) })
  .superRefine((value, context) => {
    const parsed = validatePricingBody(value);
    if (!parsed.ok) {
      context.addIssue({
        code: "custom",
        path: ["pricing"],
        message: parsed.reason,
      });
    }
  });

export default defineHandler({
  methods: ["PUT"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "aiTelemetry" },
  unhandledMessage: "AI 모델 단가 저장에 실패했습니다.",
  logLabel: "admin/ai-telemetry-pricing",
  headers: { "Cache-Control": "no-store" },
  body: bodySchema,
  handler: async (_req, res, ctx) => {
    const parsed = validatePricingBody(ctx.body);
    if (!parsed.ok) throw new Error(parsed.reason);
    const { error } = await ctx.supabaseAdmin.from("app_settings").upsert(
      {
        key: AI_MODEL_PRICING_SETTING_KEY,
        value: parsed.table,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(`app_settings 저장 실패: ${error.message}`);
    res.status(200).json({ pricing: parsed.table });
  },
});

export const config = { runtime: "nodejs" };
