// POST /api/console/teachers/status  { teacherId, status: "active" | "inactive" }
//
// 선생님 활성화, 비활성화(교 #128, #150). 본인은 바꿀 수 없고 마지막 학교 관리자는 DB 가 막는다.
// DB 를 먼저 커밋하면 콘솔 판정이 곧바로 막히고, Auth 정지는 그 뒤에 한다(실패하면 같은 요청을 다시 보낸다).
// 권한: 학교 관리자 또는 본사 대행.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import {
  RpcError,
  TEACHERS_RESOURCE_KEY,
} from "../../_lib/console/teacherAccounts.js";
import {
  loadTeachersInScope,
  setAuthBan,
} from "../../_lib/console/teacherManage.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "상태를 바꾸지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/status]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const { teacherId, status } = (req.body ?? {}) as Record<string, unknown>;
    if (
      typeof teacherId !== "string" ||
      teacherId === "" ||
      (status !== "active" && status !== "inactive")
    ) {
      sendError(
        res,
        "coded",
        400,
        "대상과 상태를 확인해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");

    const scoped = await loadTeachersInScope(
      ctx.supabaseAdmin,
      actor.tenantId,
      [teacherId],
    );
    if (!scoped) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    const { data: profileId, error } = await ctx.supabaseAdmin.rpc(
      "fn_teacher_set_status",
      { p_teacher_id: teacherId, p_status: status, p_actor: ctx.userId },
    );
    if (error) throw new RpcError("fn_teacher_set_status", error.code);

    await writeConsoleAuditLog(
      {
        supabaseAdmin: ctx.supabaseAdmin,
        userId: ctx.userId,
        user: ctx.user,
        console: actor,
      },
      {
        action: "account_status",
        resourceKey: TEACHERS_RESOURCE_KEY,
        targetId: teacherId,
        meta: { status },
      },
    );

    if (typeof profileId === "string") {
      await setAuthBan(ctx.supabaseAdmin, profileId, status);
    }
    res.status(200).json({ ok: true });
  },
});
