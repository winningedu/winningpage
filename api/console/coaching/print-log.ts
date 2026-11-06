// POST /api/console/coaching/print-log { studentId }
//
// 개인종합코칭 PDF 를 열 때 접근 로그를 남긴다(교 #234). 인쇄는 요청마다 한 번의 사건이라 멱등 키를 두지 않는다.
// 범위는 코칭 조회와 같다(담임은 현재 담당 학급, 학교 관리자와 대행은 기관 전체, 범위 밖은 404).
// 로그를 남기지 못하면 500 이라 화면은 인쇄 창을 열지 않는다.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { loadScopedEnrollment } from "../../_lib/console/studentScope.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "인쇄 기록을 남기지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/coaching/print-log]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");

    const { studentId } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof studentId !== "string" || studentId === "") {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    if (!(await loadScopedEnrollment(ctx.supabaseAdmin, res, actor, studentId)))
      return;

    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      { action: "export", resourceKey: "coachingPdf", targetId: studentId },
    );
    res.status(200).json({ ok: true });
  },
});
