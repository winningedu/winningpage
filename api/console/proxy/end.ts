// POST /api/console/proxy/end
//
// 본사 관리자의 열린 대행 세션을 닫는다(설계 5.2절, D10).
// 권한: 로그인 + HQ 권한 teacherConsoleProxy edit.

import { hasProxyEditPermission } from "../../_lib/console/proxy.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "대행을 종료하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/proxy/end]",
  headers: { "Cache-Control": "no-store" },
  handler: async (_req, res, ctx) => {
    if (
      !(await hasProxyEditPermission(ctx.supabaseAdmin, ctx.userId as string))
    ) {
      sendError(res, "coded", 403, "대행 권한이 없습니다.", "FORBIDDEN");
      return;
    }
  },
});
