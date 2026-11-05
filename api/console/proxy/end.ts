// POST /api/console/proxy/end
//
// 본사 관리자의 열린 대행 세션을 닫는다(설계 5.2절, D10).
// 권한: 로그인 + HQ 권한 teacherConsoleProxy edit.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import {
  hasProxyEditPermission,
  PROXY_RESOURCE_KEY,
} from "../../_lib/console/proxy.js";
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

    const db = ctx.supabaseAdmin;
    const { data: sessionId, error: endError } = await db.rpc("fn_proxy_end", {
      p_admin: ctx.userId,
    });
    if (endError) throw new Error("fn_proxy_end failed");
    // 열린 세션이 없으면 이미 끝난 것이다. 다시 불러도 같은 결과로 응답한다.
    if (typeof sessionId !== "string") {
      res.status(200).json({ ok: true, ended: false });
      return;
    }

    const { data: session, error: sessionError } = await db
      .from("proxy_sessions")
      .select("tenant_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError || !session)
      throw new Error("proxy session lookup failed");

    await writeConsoleAuditLog(
      {
        supabaseAdmin: db,
        userId: ctx.userId,
        user: ctx.user,
        console: {
          kind: "hq_proxy",
          tenantId: session.tenant_id,
          teacherId: null,
          classIds: [],
          proxySessionId: sessionId,
          mustChangePassword: false,
          loginId: null,
        },
      },
      { action: "proxy_end", resourceKey: PROXY_RESOURCE_KEY },
    );

    res.status(200).json({ ok: true, ended: true, sessionId });
  },
});
