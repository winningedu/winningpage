// /api/admin/ai-telemetry-pricing 의 PUT. 관리자 앱(api/_routes/admin/app.ts)이 .route("/ai-telemetry-pricing", aiTelemetryPricing) 로 붙인다.
// PUT { pricing: { [model]: { input_usd_per_1m, output_usd_per_1m, cached_input_usd_per_1m } } }
// Authorization: Bearer <supabase access token>   (관리자, 메뉴 aiTelemetry edit)
//
// AI 모델 단가표를 app_settings 에 통째로 교체 저장한다. 검증 규칙은 shared/ai-telemetry/contract.ts 의 pricingBody.
// 쓰는 곳은 app_settings 의 단가 키 한 행(value, updated_at)뿐이다.
//
// 응답 200 { pricing }
// 오류(problem): 400 VALIDATION_FAILED, 401/403 인증과 권한, 405, 500

import {
  type PricingSaved,
  pricingBody,
} from "../../../shared/ai-telemetry/contract.js";
import { AI_MODEL_PRICING_SETTING_KEY } from "../../_lib/ai/telemetry/pricing.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

const guard = admin({
  permission: { key: "aiTelemetry" },
  unhandledMessage: "AI 모델 단가 저장에 실패했습니다.",
  logLabel: "admin/ai-telemetry-pricing",
});

export const aiTelemetryPricing = adminFactory
  .createApp()
  .put("/", guard, validate("json", pricingBody), async (c) => {
    const { pricing } = c.req.valid("json");
    const { error } = await c.var.supabaseAdmin.from("app_settings").upsert(
      {
        key: AI_MODEL_PRICING_SETTING_KEY,
        value: pricing,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(`app_settings 저장 실패: ${error.message}`);
    return c.json({ pricing } satisfies PricingSaved);
  })
  .all("/", methodNotAllowed("PUT"));
