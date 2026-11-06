// POST /api/console/teachers/delete  { teacherIds: string[] }
//
// 선생님 삭제, 한 명 또는 여러 명(교 #118, #211). 담당 학급을 모두 지우고 soft delete 한다.
// 로그인 아이디는 다시 쓰이지 않는다. 응답에 담당 학급의 재학생 수를 싣는다(W14d 안내).
// DB 를 먼저 커밋하고 Auth 사용자 삭제는 그 뒤에 한다. 실패하면 같은 요청을 다시 보내 마무리한다.
// 권한: 학교 관리자 또는 본사 대행.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import {
  RpcError,
  TEACHERS_RESOURCE_KEY,
} from "../../_lib/console/teacherAccounts.js";
import {
  deleteAuthUser,
  loadTeachersInScope,
  sendTeacherError,
} from "../../_lib/console/teacherManage.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface DeletedRow {
  teacher_id: string;
  profile_id: string | null;
  active_students: number | string;
}

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "선생님을 삭제하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/delete]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const { teacherIds } = (req.body ?? {}) as Record<string, unknown>;
    if (
      !Array.isArray(teacherIds) ||
      teacherIds.length === 0 ||
      !teacherIds.every((id) => typeof id === "string" && id !== "")
    ) {
      sendError(
        res,
        "coded",
        400,
        "삭제할 선생님을 선택해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }
    const ids = [...new Set(teacherIds as string[])];
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    // 삭제된 교사도 허용한다: Auth 삭제가 끊긴 뒤 같은 요청을 다시 보내는 재시도 경로다.
    const scoped = await loadTeachersInScope(admin, actor.tenantId, ids, {
      allowDeleted: true,
    });
    if (!scoped) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    try {
      const { data, error } = await admin.rpc("fn_teacher_soft_delete", {
        p_teacher_ids: ids,
        p_actor: ctx.userId,
        p_tenant: actor.tenantId,
      });
      if (error) throw new RpcError("fn_teacher_soft_delete", error.code);
      const rows = (data ?? []) as DeletedRow[];
      const activeStudents = rows.reduce(
        (sum, row) => sum + Number(row.active_students),
        0,
      );

      await writeConsoleAuditLog(
        {
          supabaseAdmin: admin,
          userId: ctx.userId,
          user: ctx.user,
          console: actor,
        },
        {
          action: "account_delete",
          resourceKey: TEACHERS_RESOURCE_KEY,
          rowCount: rows.length,
          meta: { teacherIds: ids, activeStudents },
        },
      );

      for (const row of rows) {
        if (row.profile_id) await deleteAuthUser(admin, row.profile_id);
      }
      res.status(200).json({ ok: true, deleted: rows.length, activeStudents });
    } catch (error) {
      if (sendTeacherError(res, error)) return;
      throw error;
    }
  },
});
