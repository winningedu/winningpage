// POST /api/console/classes/delete  { classId }
//
// 빈 반 삭제(QA 51). 학교 관리자와 본사 대행만. 등록 학생, 대기 명단, 담당 선생님이 하나라도 있으면 409.
// 검사와 삭제는 fn_class_delete 한 번으로 끝나 그 사이에 학생이 들어와도 비어 있지 않은 반은 지워지지 않는다.
// 이미 지워졌거나 다른 기관의 반이면 404 라서, 성공한 요청을 다시 보내면 404 를 받는다. 접근 로그는 삭제 뒤에 쓴다(결정 18).

import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface DeletedClass {
  id: string;
  grade: string | null;
  name: string;
}

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "반을 삭제하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/classes/delete]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const { classId } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof classId !== "string" || classId === "") {
      sendError(res, "coded", 400, "삭제할 반을 선택해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data, error } = await admin.rpc("fn_class_delete", {
      p_class_id: classId,
      p_tenant: actor.tenantId,
    });
    if (error) throw new Error("class delete failed");
    const deleted = ((data ?? []) as DeletedClass[])[0];

    if (!deleted) {
      const { data: found, error: readError } = await admin
        .from("classes")
        .select("id")
        .eq("id", classId)
        .eq("tenant_id", actor.tenantId)
        .maybeSingle();
      if (readError) throw new Error("class read failed");
      if (found) {
        sendError(
          res,
          "coded",
          409,
          "학생이나 담당 선생님이 있는 반은 삭제할 수 없어요.",
          "CLASS_NOT_EMPTY",
        );
      } else {
        sendError(
          res,
          "coded",
          404,
          "이미 삭제되었거나 없는 반이에요.",
          "CLASS_NOT_FOUND",
        );
      }
      return;
    }

    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      {
        action: "update",
        resourceKey: "classDelete",
        targetId: deleted.id,
        rowCount: 1,
        meta: { classId: deleted.id, grade: deleted.grade, name: deleted.name },
      },
    );
    res.status(200).json({ ok: true });
  },
});
