// POST /api/console/enrollment/export  { classCount }
//
// W7 엑셀 출력 기록(교 #227). 파일은 브라우저가 만들고(집계만, 교 #40) 서버는 출력할 때마다 접근 로그만 남긴다.
// 출력마다 한 줄이 쌓이는 기록이라 같은 요청을 다시 보내면 한 줄이 더 쌓인다(출력 횟수가 곧 로그 횟수).

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "출력 기록을 남기지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/enrollment/export]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");

    const classCount = (req.body as { classCount?: unknown } | null)
      ?.classCount;
    if (
      typeof classCount !== "number" ||
      !Number.isInteger(classCount) ||
      classCount < 0
    ) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      { action: "export", resourceKey: "enrollment", rowCount: classCount },
    );
    res.status(200).json({ ok: true });
  },
});
