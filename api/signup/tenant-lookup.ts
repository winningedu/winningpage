// POST /api/signup/tenant-lookup  { code }
//
// 스쿨멘토 가입 1단계: 소속코드로 기관을 찾는다. 계정이 없는 상태라 auth:"none" 이고,
// 오답 횟수 제한(IP 당 1시간 10회, 초과 시 WC068)은 DB 함수가 센다.
// 위닝 배포에서는 404.

import { defineHandler } from "../_lib/handler.js";
import { getClientIp } from "../_lib/phoneCode.js";
import { isSchoolmentorSite } from "../_lib/signup/site.js";

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
    const { code } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof code !== "string" || !code.trim()) {
      res.status(400).json({ code: "VALIDATION" });
      return;
    }
    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_signup_tenant_lookup",
      { p_code: code.trim(), p_ip: getClientIp(req) as string },
    );
    if (error?.code === "WC068") {
      res.status(429).json({ code: "WC068" });
      return;
    }
    if (error) throw error;
    const tenant = data?.[0];
    if (!tenant) {
      res.status(404).json({ code: "TENANT_NOT_FOUND" });
      return;
    }
    res.status(200).json({
      tenantId: tenant.id,
      name: tenant.name,
      orgType: tenant.org_type,
    });
  },
});
