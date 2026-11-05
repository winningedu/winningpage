// POST /api/console/students/flag { studentId }, DELETE /api/console/students/flag?studentId=
//
// W6a 특이학생 지정과 해제(사 #147). 담임은 담당 학급 학생만, 학교 관리자와 본사 대행은 기관 전체다.
// 범위 밖과 다른 기관의 학생은 404 로 숨긴다. 학생당 지정은 한 행이라(기본 키) 두 번 지정해도 같은 성공이고,
// 해제도 이미 풀려 있으면 같은 성공이다. 변경마다 접근 로그를 남기고, 남기지 못하면 500 이다.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { loadTenant, readAll } from "../../_lib/console/directory.js";
import { isInScope } from "../../_lib/console/scope.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const UNIQUE_VIOLATION = "23505";

function queryValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default defineHandler({
  methods: ["POST", "DELETE"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "특이학생 지정을 처리하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/students/flag]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;
    const flagging = req.method === "POST";

    const studentId = flagging
      ? (req.body as { studentId?: unknown } | null)?.studentId
      : queryValue(req.query.studentId);
    if (typeof studentId !== "string" || studentId === "") {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const enrollments = await readAll<{ class_id: string | null }>(
      admin,
      "student_enrollments",
      "class_id",
      (q) =>
        q
          .eq("tenant_id", actor.tenantId)
          .eq("student_id", studentId)
          .eq("school_year", schoolYear),
      "student_id",
    );
    const enrollment = enrollments[0];
    if (
      !enrollment ||
      !isInScope(actor, {
        tenantId: actor.tenantId,
        classId: enrollment.class_id,
      })
    ) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    if (flagging) {
      const { error } = await admin.from("student_flags").insert({
        student_id: studentId,
        tenant_id: actor.tenantId,
        flagged_teacher_id: actor.teacherId,
      });
      if (error && error.code !== UNIQUE_VIOLATION) {
        throw new Error("student flag insert failed");
      }
    } else {
      const { error } = await admin
        .from("student_flags")
        .delete()
        .eq("student_id", studentId)
        .eq("tenant_id", actor.tenantId);
      if (error) throw new Error("student flag delete failed");
    }

    await writeConsoleAuditLog(
      { ...ctx, supabaseAdmin: admin, console: actor },
      {
        action: "update",
        resourceKey: "studentFlag",
        targetId: studentId,
        meta: { flagged: flagging },
      },
    );
    res.status(200).json({ ok: true, flagged: flagging });
  },
});
