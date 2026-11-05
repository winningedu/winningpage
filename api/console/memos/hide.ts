// POST /api/console/memos/hide { memoId }
//
// W9d 메모 삭제. 작성자만 자기 메모를 화면에서 숨긴다(hidden_at). 행과 작성자, 시각은 남는다(교 #61, 결정 3).
// 다른 교사의 메모는 403, 없거나 다른 기관의 메모는 404. 이미 숨긴 메모는 아무것도 바꾸지 않고 성공이다.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { readAll } from "../../_lib/console/directory.js";
import { MEMO_COLUMNS, type MemoRow } from "../../_lib/console/teacherMemos.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "메모를 지우지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/memos/hide]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const { memoId } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof memoId !== "string" || memoId === "") {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    if (actor.teacherId === null) {
      sendError(res, "coded", 403, "메모를 지울 수 없습니다.", "FORBIDDEN");
      return;
    }

    const [memo] = await readAll<MemoRow>(
      admin,
      "teacher_memos",
      MEMO_COLUMNS,
      (q) => q.eq("tenant_id", actor.tenantId).eq("id", memoId),
    );
    if (!memo) {
      sendError(res, "coded", 404, "메모를 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }
    if (memo.author_teacher_id !== actor.teacherId) {
      sendError(
        res,
        "coded",
        403,
        "작성한 교사만 지울 수 있어요.",
        "FORBIDDEN",
      );
      return;
    }
    if (memo.hidden_at !== null) {
      res.status(200).json({ ok: true });
      return;
    }

    const { error } = await admin
      .from("teacher_memos")
      .update({ hidden_at: new Date().toISOString() })
      .eq("id", memoId)
      .eq("author_teacher_id", actor.teacherId);
    if (error) throw new Error("memo hide failed");

    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      {
        action: "update",
        resourceKey: "teacherMemo",
        targetId: memoId,
        meta: { studentId: memo.student_id, op: "hide" },
      },
    );
    res.status(200).json({ ok: true });
  },
});
