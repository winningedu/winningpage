// POST /api/signup/tenant-lookup  { code }
//
// 스쿨멘토 가입 1단계: 소속코드로 기관을 찾는다. 계정이 없는 상태라 auth:"none" 이고,
// 오답 횟수 제한(IP 당 1시간 10회, 초과 시 WC068)은 DB 함수가 센다.
// 위닝 배포에서는 404.

import { defineHandler } from "../../_lib/handler.js";
import { getClientIp } from "../../_lib/phoneCode.js";
import { lookupSignupTenant } from "../../_lib/signup/tenant.js";
import { isSchoolmentorSite } from "../../_lib/site.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "detail",
  methodNotAllowedExtra: { code: "METHOD_NOT_ALLOWED" },
  unhandledMessage: "잠시 후 다시 시도해 주세요.",
  unhandledExtra: { code: "INTERNAL", message: "잠시 후 다시 시도해 주세요." },
  logLabel: "[signup/tenant-lookup]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      res.status(404).json({ code: "NOT_FOUND" });
      return;
    }
    const ip = getClientIp(req);
    if (!ip) {
      res.status(400).json({ code: "CLIENT_IP_MISSING" });
      return;
    }
    const { code } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof code !== "string" || !code.trim()) {
      res.status(400).json({ code: "VALIDATION" });
      return;
    }
    const result = await lookupSignupTenant(ctx.supabaseAdmin, code.trim(), ip);
    if (!result.ok) {
      if (result.reason === "rate_limited") {
        res.status(429).json({ code: "WC068" });
      } else {
        res.status(404).json({ code: "TENANT_NOT_FOUND" });
      }
      return;
    }
    res.status(200).json({
      tenantId: result.tenant.id,
      name: result.tenant.name,
      orgType: result.tenant.orgType,
    });
  },
});
