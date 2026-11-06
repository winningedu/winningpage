// POST /api/enrollment/join-tenant-lookup  { code }
//
// 기타 소속 학생이 옮길 기관을 소속코드로 확인한다(결정 96). 학생 id 는 토큰에서만 정한다.
// 기타 소속이 아니면 DB 가 WC098, 오답이 1시간에 10번을 넘으면 WC068 을 낸다. 위닝 배포에서는 404.

import { sendEnrollmentRpcError } from "../_lib/console/enrollmentErrors.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { isSchoolmentorSite } from "../_lib/site.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "소속코드를 확인하지 못했어요.",
  unhandledCode: "INTERNAL",
  logLabel: "[enrollment/join-tenant-lookup]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      sendError(res, "coded", 404, "찾을 수 없어요.", "NOT_FOUND");
      return;
    }
    const studentId = requireUserId(ctx);
    const { code } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof code !== "string" || !code.trim()) {
      sendError(res, "coded", 400, "소속코드를 입력해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_catch_all_tenant_lookup",
      { p_user: studentId, p_code: code.trim() },
    );
    if (error) {
      if (sendEnrollmentRpcError(res, error)) return;
      throw new Error("fn_catch_all_tenant_lookup failed");
    }
    const tenant = data?.[0];
    if (!tenant) {
      sendError(
        res,
        "coded",
        404,
        "소속코드를 다시 확인해 주세요.",
        "TENANT_NOT_FOUND",
      );
      return;
    }
    res
      .status(200)
      .json({ ok: true, name: tenant.name, orgType: tenant.org_type });
  },
});
