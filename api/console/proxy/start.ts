// POST /api/console/proxy/start  { tenantId, reason }
//
// 본사 관리자가 기관 콘솔을 대행하는 8시간 세션을 연다(설계 5.2절, D10).
// 권한: 로그인 + HQ 권한 teacherConsoleProxy edit (fn_admin_effective_permissions).

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import {
  hasProxyEditPermission,
  PROXY_RESOURCE_KEY,
} from "../../_lib/console/proxy.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { assertQaAdminMayWrite } from "../../_lib/qaAccount.js";

export const config = { runtime: "nodejs" };

const REASONS = ["admin_absent", "roster_proxy", "incident_support"] as const;
type ProxyReason = (typeof REASONS)[number];

function parseBody(
  body: unknown,
): { tenantId: string; reason: ProxyReason } | null {
  const { tenantId, reason } = (body ?? {}) as Record<string, unknown>;
  if (typeof tenantId !== "string" || tenantId === "") return null;
  const matched = REASONS.find((r) => r === reason);
  return matched ? { tenantId, reason: matched } : null;
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "대행을 시작하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/proxy/start]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (
      !(await hasProxyEditPermission(ctx.supabaseAdmin, ctx.userId as string))
    ) {
      sendError(res, "coded", 403, "대행 권한이 없습니다.", "FORBIDDEN");
      return;
    }

    await assertQaAdminMayWrite(ctx.supabaseAdmin, ctx.userId as string);
    const body = parseBody(req.body);
    if (!body) {
      sendError(
        res,
        "coded",
        400,
        "기관과 대행 사유를 확인해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }

    const { data: sessionId, error: startError } = await ctx.supabaseAdmin.rpc(
      "fn_proxy_start",
      {
        p_admin: ctx.userId,
        p_tenant: body.tenantId,
        p_reason: body.reason,
      },
    );
    if (startError?.code === "23503") {
      sendError(
        res,
        "coded",
        404,
        "기관을 찾을 수 없습니다.",
        "TENANT_NOT_FOUND",
      );
      return;
    }
    if (startError || typeof sessionId !== "string") {
      throw new Error("fn_proxy_start failed");
    }

    await writeConsoleAuditLog(
      {
        supabaseAdmin: ctx.supabaseAdmin,
        userId: ctx.userId,
        user: ctx.user,
        console: {
          kind: "hq_proxy",
          tenantId: body.tenantId,
          teacherId: null,
          classIds: [],
          proxySessionId: sessionId,
          mustChangePassword: false,
          loginId: null,
        },
      },
      {
        action: "proxy_start",
        resourceKey: PROXY_RESOURCE_KEY,
        reason: body.reason,
      },
    );

    res.status(200).json({ ok: true, sessionId });
  },
});
