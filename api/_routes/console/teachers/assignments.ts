// POST /api/console/teachers/assignments
//   { teacherId, add?: [{ grade, name, groupId? }], removeClassIds?: string[], primaryClassId?: string }
//
// 담당 학급 변경(W16a, 교 #232). 한 트랜잭션에서 더하고, 지우고, 주담당을 정한다.
// 담임의 마지막 학급 제거는 막고, 다른 교사가 이미 담임인 학급은 409 다.
// 권한: 학교 관리자 또는 본사 대행.

import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import {
  parseClassRows,
  RpcError,
} from "../../../_lib/console/teacherAccounts.js";
import {
  loadTeachersInScope,
  sendTeacherError,
} from "../../../_lib/console/teacherManage.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const ASSIGNMENTS_RESOURCE_KEY = "console.teacher_assignments";

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((v) => typeof v === "string" && v !== "")
  );
}

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "담당 학급을 바꾸지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/teachers/assignments]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const add = parseClassRows(raw.add);
    const removeClassIds = raw.removeClassIds ?? [];
    const primary = raw.primaryClassId ?? null;
    if (
      typeof raw.teacherId !== "string" ||
      raw.teacherId === "" ||
      !add ||
      !isStringArray(removeClassIds) ||
      (primary !== null && typeof primary !== "string")
    ) {
      sendError(
        res,
        "coded",
        400,
        "대상과 학급을 확인해 주세요.",
        "BAD_REQUEST",
      );
      return;
    }
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const scoped = await loadTeachersInScope(admin, actor.tenantId, [
      raw.teacherId,
    ]);
    if (!scoped) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    try {
      const { error } = await admin.rpc("fn_assignment_set", {
        p_teacher_id: raw.teacherId,
        p_add: add,
        p_remove_class_ids: removeClassIds,
        p_primary: primary,
        p_tenant: actor.tenantId,
      });
      if (error) throw new RpcError("fn_assignment_set", error.code);

      await writeConsoleAuditLog(
        {
          supabaseAdmin: admin,
          userId: ctx.userId,
          user: ctx.user,
          console: actor,
        },
        {
          action: "update",
          resourceKey: ASSIGNMENTS_RESOURCE_KEY,
          targetId: raw.teacherId,
          meta: {
            added: add.length,
            removed: removeClassIds.length,
            primaryClassId: primary,
          },
        },
      );
      res.status(200).json({ ok: true });
    } catch (error) {
      if (sendTeacherError(res, error)) return;
      throw error;
    }
  },
});
