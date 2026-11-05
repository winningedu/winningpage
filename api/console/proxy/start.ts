// POST /api/console/proxy/start  { tenantId, reason }
//
// 본사 관리자가 기관 콘솔을 대행하는 8시간 세션을 연다(설계 5.2절, D10).
// 권한: 로그인 + HQ 권한 teacherConsoleProxy edit (fn_admin_effective_permissions).

import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

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
    const { data: perms, error: permError } = await ctx.supabaseAdmin.rpc(
      "fn_admin_effective_permissions",
      { p_profile_id: ctx.userId },
    );
    if (permError) throw new Error("admin permission lookup failed");
    const canProxy = (perms ?? []).some(
      (row: { resource_key?: string; level?: string }) =>
        row.resource_key === "teacherConsoleProxy" && row.level === "edit",
    );
    if (!canProxy) {
      sendError(res, "coded", 403, "대행 권한이 없습니다.", "FORBIDDEN");
      return;
    }

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
  },
});
