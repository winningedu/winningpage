// POST /api/console/groups/delete  { groupId }
//
// 그룹 삭제(W11, soft delete). 학교 관리자와 본사 대행만.
// 올해 학급에 재학생이 있으면 fn_group_soft_delete 가 WC086 으로 막는다. 다른 기관의 그룹 id 는 404 로 숨긴다.
// 이미 삭제된 그룹을 다시 지워도 DB 가 그대로 돌려보내므로 멱등이다.

import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import { sendEnrollmentRpcError } from "../../../_lib/console/enrollmentErrors.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "그룹을 삭제하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/groups/delete]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const { groupId } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof groupId !== "string" || groupId === "") {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data: group, error: lookupError } = await ctx.supabaseAdmin
      .from("class_groups")
      .select("id, name")
      .eq("id", groupId)
      .eq("tenant_id", actor.tenantId)
      .maybeSingle();
    if (lookupError) throw new Error("class group lookup failed");
    if (!group) {
      sendError(res, "coded", 404, "그룹을 찾을 수 없어요.", "NOT_FOUND");
      return;
    }

    const { error } = await ctx.supabaseAdmin.rpc("fn_group_soft_delete", {
      p_group: groupId,
      p_actor: ctx.userId as string,
      p_tenant: actor.tenantId,
    });
    if (error) {
      if (sendEnrollmentRpcError(res, error)) return;
      throw new Error("fn_group_soft_delete failed");
    }

    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      {
        action: "update",
        resourceKey: "classGroup",
        targetId: groupId,
        meta: { op: "delete", name: group.name },
      },
    );

    res.status(200).json({ ok: true });
  },
});
